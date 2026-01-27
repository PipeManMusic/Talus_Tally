from .models import Task, Status

class PriorityEngine:
    def calculate_task_score(
        self,
        sub_project_priority: int,
        wp_importance: int,
        task: Task,
        *,
        forced_blocked: bool = False,
    ) -> float:
        """
        Calculates a 'Velocity Score' for a task.
        V1.1: Handles non-physical tasks and zero-cost items.
        """
        task_status = Status.BLOCKED if forced_blocked else getattr(task, "status", None)

        # 1. Handle Free/Software items
        # If it costs nothing but has importance, it can be a "Quick Win"
        if task.estimated_cost <= 0.01 and task_status != Status.BLOCKED:
            has_blocking = bool(getattr(task, "blocking", None))
            if task.importance and task.importance > 0:
                if has_blocking or task.importance >= 10:
                    return 9999.0
            if task.budget_priority is None:
                # Software/Admin baseline score
                return 500.0
        
        # 2. Normalized Cost
        cost_factor = max(task.estimated_cost, 1.0)
        
        # 3. Strategic Multiplier (SubProject * WorkPackage)
        strategy_score = sub_project_priority * wp_importance
        
        # 4. Technical Value (Default None to neutral 5)
        t_imp = task.importance if task.importance is not None else 5
        t_fin = task.budget_priority if task.budget_priority is not None else 5
        
        technical_value = (t_imp * 1.5) + (t_fin * 1.0)
        
        blocking = getattr(task, "blocking", None) or []
        blocker_bonus = len(blocking) * 50

        # 5. Final Calculation
        raw_score = (technical_value / cost_factor) * strategy_score
        raw_score += blocker_bonus

        if task_status == Status.BLOCKED:
            return 0.0
        
        return round(raw_score, 2)

    def calculate_combined_priority(
        self,
        sub_project_priority: int,
        wp_importance: int,
        task: Task,
        *,
        base_score: float | None = None,
        forced_blocked: bool = False,
    ) -> float:
        if base_score is None:
            base_score = self.calculate_task_score(
                sub_project_priority,
                wp_importance,
                task,
                forced_blocked=forced_blocked,
            )
        if base_score >= 9000:  # Preserve quick-win ceiling
            return base_score

        task_status = Status.BLOCKED if forced_blocked else getattr(task, "status", None)
        downtime_weight = task.budget_priority if task.budget_priority is not None else 0
        if task_status == Status.BLOCKED:
            downtime_weight = 0
        combined = base_score + (downtime_weight * 10)
        return round(combined, 2)