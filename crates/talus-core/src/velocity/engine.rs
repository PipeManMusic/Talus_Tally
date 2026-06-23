//! Stateful velocity orchestration.
//!
//! Ports the recursive parts of `VelocityEngine.calculate_velocity` /
//! `_calculate_inherited_score` from `backend/core/velocity_engine.py`. The
//! engine walks a [`Project`]'s graph, memoizing each node's
//! [`VelocityCalculation`] and guarding against cycles while a node's score is
//! still being built.
//!
//! Blocking relationships are layered on in later cycles; this stage computes
//! `total = base + inherited + status + numerical` (the blocking term is `0`
//! when there are no blocking relationships, so this matches the Python total
//! for unblocked projects).

use std::collections::{HashMap, HashSet};

use chrono::NaiveDate;

use crate::graph::Parent;
use crate::ids::NodeId;
use crate::node_type::NodeType;
use crate::project::Project;
use crate::velocity::{base_score, numerical_score, status_score, ScoreMode, VelocityCalculation};

/// Recursively scores the nodes of a [`Project`].
///
/// Holds the per-node cache and the in-progress bookkeeping used to break
/// inheritance cycles. Construct one per scoring pass: the caches are not
/// invalidated, so a fresh engine is needed whenever the project mutates.
pub struct VelocityEngine<'a> {
    project: &'a Project,
    today: NaiveDate,
    cache: HashMap<NodeId, VelocityCalculation>,
    building: HashSet<NodeId>,
    in_progress_totals: HashMap<NodeId, f64>,
}

impl<'a> VelocityEngine<'a> {
    /// Create an engine over `project`, scoring date properties relative to
    /// `today` (supplied by the caller so the engine stays clock-free).
    #[must_use]
    pub fn new(project: &'a Project, today: NaiveDate) -> Self {
        Self {
            project,
            today,
            cache: HashMap::new(),
            building: HashSet::new(),
            in_progress_totals: HashMap::new(),
        }
    }

    /// Compute the [`VelocityCalculation`] for `node_id`.
    ///
    /// Results are memoized. A node already being built (reached via its own
    /// inheritance chain) scores all zeros, breaking the cycle. An unknown
    /// node (absent from the graph, or whose kind is not in the registry)
    /// also scores all zeros.
    pub fn calculate_velocity(&mut self, node_id: NodeId) -> VelocityCalculation {
        if let Some(cached) = self.cache.get(&node_id) {
            return cached.clone();
        }
        if self.building.contains(&node_id) {
            return VelocityCalculation::zeroed(node_id);
        }
        // Copy the project reference so node lookups borrow the project, not
        // `self`; this frees `&mut self` for the recursive inheritance call.
        let project = self.project;
        let Some(node) = project.graph().get(node_id) else {
            return VelocityCalculation::zeroed(node_id);
        };
        let Some(node_type) = project.get_node_type(node.kind()) else {
            return VelocityCalculation::zeroed(node_id);
        };

        self.building.insert(node_id);

        let mut calc = VelocityCalculation::zeroed(node_id);
        calc.base_score = base_score(node_type);
        if should_inherit(node_type) {
            calc.inherited_score = self.inherited_score(node_id);
        }
        calc.status_score = status_score(node, node_type, self.today);
        calc.numerical_score = numerical_score(node, node_type);

        // Record the inheritable total before recursing further so a child
        // reached via a cycle can read it from `in_progress_totals`.
        self.in_progress_totals
            .insert(node_id, calc.inheritable_total());

        calc.total_velocity =
            calc.base_score + calc.inherited_score + calc.status_score + calc.numerical_score;

        self.cache.insert(node_id, calc.clone());
        self.in_progress_totals.remove(&node_id);
        self.building.remove(&node_id);
        calc
    }

    /// Return the immediate parent's inheritable total, mirroring
    /// `_calculate_inherited_score`. A root contributes `0`; a parent still
    /// being built contributes its in-progress total (cycle path).
    fn inherited_score(&mut self, node_id: NodeId) -> f64 {
        let parent = match self.project.graph().parent_of(node_id) {
            Parent::Root => return 0.0,
            Parent::Of(parent) => parent,
        };
        if self.building.contains(&parent) {
            return self.in_progress_totals.get(&parent).copied().unwrap_or(0.0);
        }
        if let Some(cached) = self.cache.get(&parent) {
            return cached.inheritable_total();
        }
        self.calculate_velocity(parent).inheritable_total()
    }
}

/// Whether a node type's children-style inheritance applies: a node with no
/// velocity config inherits, as does one whose only config is per-property
/// (no node-level config) or whose node-level config is `inherit` mode.
/// A node-level `fixed` config counts only its own score.
fn should_inherit(node_type: &NodeType) -> bool {
    if !node_type.has_velocity_config() {
        return true;
    }
    match node_type.velocity_config() {
        None => true,
        Some(config) => matches!(config.score_mode, ScoreMode::Inherit),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::ids::PropertyId;
    use crate::ids::TemplateId;
    use crate::node::Node;
    use crate::node_type::NodeType;
    use crate::property::Property;
    use crate::velocity::{
        NodeVelocityConfig, PropertyVelocityConfig, PropertyVelocityMode, ScoreMode,
    };

    fn approx(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-9,
            "expected {expected}, got {actual}"
        );
    }

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 6, 17).unwrap()
    }

    fn fixed_cfg(base: f64) -> NodeVelocityConfig {
        NodeVelocityConfig {
            base_score: base,
            score_mode: ScoreMode::Fixed,
        }
    }

    fn inherit_cfg(base: f64) -> NodeVelocityConfig {
        NodeVelocityConfig {
            base_score: base,
            score_mode: ScoreMode::Inherit,
        }
    }

    fn checkbox_cfg() -> PropertyVelocityConfig {
        PropertyVelocityConfig {
            enabled: true,
            mode: PropertyVelocityMode::Checkbox {
                checked_score: 4.0,
                unchecked_score: 0.0,
            },
        }
    }

    fn multiplier_cfg() -> PropertyVelocityConfig {
        PropertyVelocityConfig {
            enabled: true,
            mode: PropertyVelocityMode::Multiplier {
                multiplier_factor: 2.0,
                penalty_mode: false,
            },
        }
    }

    #[test]
    fn no_config_root_scores_minus_one_sentinel() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = NodeType::new("Task");
        let kind = nt.id();
        p.register_node_type(nt).unwrap();
        let node = Node::new(kind, "n");
        let nid = node.id();
        p.insert_node(node).unwrap();

        let mut engine = VelocityEngine::new(&p, today());
        let calc = engine.calculate_velocity(nid);
        approx(calc.base_score, -1.0);
        approx(calc.total_velocity, -1.0);
    }

    #[test]
    fn fixed_root_base_is_total_without_inheritance() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = NodeType::new("Task").with_velocity_config(fixed_cfg(5.0));
        let kind = nt.id();
        p.register_node_type(nt).unwrap();
        let node = Node::new(kind, "n");
        let nid = node.id();
        p.insert_node(node).unwrap();

        let mut engine = VelocityEngine::new(&p, today());
        let calc = engine.calculate_velocity(nid);
        approx(calc.base_score, 5.0);
        approx(calc.inherited_score, 0.0);
        approx(calc.total_velocity, 5.0);
    }

    #[test]
    fn no_config_child_inherits_parent_total() {
        let mut p = Project::new("P", TemplateId::new());
        let leaf = NodeType::new("Task");
        let leaf_kind = leaf.id();
        let section = NodeType::new("Section")
            .with_allowed_child(leaf_kind)
            .with_velocity_config(fixed_cfg(5.0));
        let section_kind = section.id();
        p.register_node_type(leaf).unwrap();
        p.register_node_type(section).unwrap();

        let parent = Node::new(section_kind, "Root");
        let parent_id = parent.id();
        let child = Node::new(leaf_kind, "Leaf");
        let child_id = child.id();
        p.insert_node(parent).unwrap();
        p.insert_node(child).unwrap();
        p.set_parent(child_id, parent_id).unwrap();

        let mut engine = VelocityEngine::new(&p, today());
        let calc = engine.calculate_velocity(child_id);
        // child base -1 (no config) + inherited 5 (parent inheritable) = 4
        approx(calc.base_score, -1.0);
        approx(calc.inherited_score, 5.0);
        approx(calc.total_velocity, 4.0);
    }

    #[test]
    fn fixed_child_does_not_inherit() {
        let mut p = Project::new("P", TemplateId::new());
        let leaf = NodeType::new("Task").with_velocity_config(fixed_cfg(3.0));
        let leaf_kind = leaf.id();
        let section = NodeType::new("Section")
            .with_allowed_child(leaf_kind)
            .with_velocity_config(fixed_cfg(5.0));
        let section_kind = section.id();
        p.register_node_type(leaf).unwrap();
        p.register_node_type(section).unwrap();

        let parent = Node::new(section_kind, "Root");
        let parent_id = parent.id();
        let child = Node::new(leaf_kind, "Leaf");
        let child_id = child.id();
        p.insert_node(parent).unwrap();
        p.insert_node(child).unwrap();
        p.set_parent(child_id, parent_id).unwrap();

        let mut engine = VelocityEngine::new(&p, today());
        let calc = engine.calculate_velocity(child_id);
        approx(calc.inherited_score, 0.0);
        approx(calc.total_velocity, 3.0);
    }

    #[test]
    fn inherit_mode_child_inherits() {
        let mut p = Project::new("P", TemplateId::new());
        let leaf = NodeType::new("Task").with_velocity_config(inherit_cfg(2.0));
        let leaf_kind = leaf.id();
        let section = NodeType::new("Section")
            .with_allowed_child(leaf_kind)
            .with_velocity_config(fixed_cfg(5.0));
        let section_kind = section.id();
        p.register_node_type(leaf).unwrap();
        p.register_node_type(section).unwrap();

        let parent = Node::new(section_kind, "Root");
        let parent_id = parent.id();
        let child = Node::new(leaf_kind, "Leaf");
        let child_id = child.id();
        p.insert_node(parent).unwrap();
        p.insert_node(child).unwrap();
        p.set_parent(child_id, parent_id).unwrap();

        let mut engine = VelocityEngine::new(&p, today());
        let calc = engine.calculate_velocity(child_id);
        // base 2 + inherited 5 = 7
        approx(calc.inherited_score, 5.0);
        approx(calc.total_velocity, 7.0);
    }

    #[test]
    fn property_only_child_inherits_and_adds_status() {
        let pid = PropertyId::new();
        let mut p = Project::new("P", TemplateId::new());
        let leaf = NodeType::new("Task")
            .with_allowed_property(pid)
            .with_property_velocity_config(pid, checkbox_cfg());
        let leaf_kind = leaf.id();
        let section = NodeType::new("Section")
            .with_allowed_child(leaf_kind)
            .with_velocity_config(fixed_cfg(5.0));
        let section_kind = section.id();
        p.register_node_type(leaf).unwrap();
        p.register_node_type(section).unwrap();

        let parent = Node::new(section_kind, "Root");
        let parent_id = parent.id();
        let child = Node::new(leaf_kind, "Leaf").with_property(pid, Property::Boolean(true));
        let child_id = child.id();
        p.insert_node(parent).unwrap();
        p.insert_node(child).unwrap();
        p.set_parent(child_id, parent_id).unwrap();

        let mut engine = VelocityEngine::new(&p, today());
        let calc = engine.calculate_velocity(child_id);
        // base 0 (config present, no node-level baseScore) + inherited 5 + status 4 = 9
        approx(calc.base_score, 0.0);
        approx(calc.inherited_score, 5.0);
        approx(calc.status_score, 4.0);
        approx(calc.total_velocity, 9.0);
    }

    #[test]
    fn minus_one_sentinel_is_transparent_through_chain() {
        let mut p = Project::new("P", TemplateId::new());
        let leaf = NodeType::new("Task");
        let leaf_kind = leaf.id();
        let mid = NodeType::new("Mid").with_allowed_child(leaf_kind);
        let mid_kind = mid.id();
        let top = NodeType::new("Top")
            .with_allowed_child(mid_kind)
            .with_velocity_config(fixed_cfg(10.0));
        let top_kind = top.id();
        p.register_node_type(leaf).unwrap();
        p.register_node_type(mid).unwrap();
        p.register_node_type(top).unwrap();

        let top_node = Node::new(top_kind, "Top");
        let top_id = top_node.id();
        let mid_node = Node::new(mid_kind, "Mid");
        let mid_id = mid_node.id();
        let leaf_node = Node::new(leaf_kind, "Leaf");
        let leaf_id = leaf_node.id();
        p.insert_node(top_node).unwrap();
        p.insert_node(mid_node).unwrap();
        p.insert_node(leaf_node).unwrap();
        p.set_parent(mid_id, top_id).unwrap();
        p.set_parent(leaf_id, mid_id).unwrap();

        let mut engine = VelocityEngine::new(&p, today());
        // mid: base -1, inherited 10 (top inheritable), total 9; inheritable max(-1,0)+10=10
        // leaf: base -1, inherited 10 (mid inheritable), total 9
        let calc = engine.calculate_velocity(leaf_id);
        approx(calc.inherited_score, 10.0);
        approx(calc.total_velocity, 9.0);
    }

    #[test]
    fn numerical_contributes_to_total() {
        let pid = PropertyId::new();
        let mut p = Project::new("P", TemplateId::new());
        let nt = NodeType::new("Task")
            .with_allowed_property(pid)
            .with_property_velocity_config(pid, multiplier_cfg());
        let kind = nt.id();
        p.register_node_type(nt).unwrap();
        let node = Node::new(kind, "n").with_property(pid, Property::Number(3.0));
        let nid = node.id();
        p.insert_node(node).unwrap();

        let mut engine = VelocityEngine::new(&p, today());
        let calc = engine.calculate_velocity(nid);
        // base 0 + numerical 3*2 = 6
        approx(calc.numerical_score, 6.0);
        approx(calc.total_velocity, 6.0);
    }

    #[test]
    fn unknown_node_scores_zero() {
        let p = Project::new("P", TemplateId::new());
        let mut engine = VelocityEngine::new(&p, today());
        let calc = engine.calculate_velocity(NodeId::new());
        approx(calc.base_score, 0.0);
        approx(calc.total_velocity, 0.0);
    }
}
