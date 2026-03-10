from backend.core.export_engine import ExportEngine


def _node(node_id: str, children=None):
    return {
        "id": node_id,
        "children": children or [],
        "properties": {"name": node_id},
    }


def test_filter_nodes_with_root_node_id_only_includes_branch():
    engine = ExportEngine()
    nodes = [
        _node("root", ["a", "b"]),
        _node("a", ["a1"]),
        _node("a1"),
        _node("b"),
        _node("outside"),
    ]

    filtered = engine.filter_nodes(nodes, root_node_id="a")
    ids = {n["id"] for n in filtered}

    assert ids == {"a", "a1"}


def test_filter_nodes_with_included_node_ids_only_includes_those_ids():
    engine = ExportEngine()
    nodes = [_node("root"), _node("a"), _node("b")]

    filtered = engine.filter_nodes(nodes, included_node_ids=["root", "b"])
    ids = {n["id"] for n in filtered}

    assert ids == {"root", "b"}


def test_filter_nodes_with_root_and_included_intersects_results():
    engine = ExportEngine()
    nodes = [
        _node("root", ["a", "b"]),
        _node("a", ["a1"]),
        _node("a1"),
        _node("b"),
    ]

    filtered = engine.filter_nodes(nodes, root_node_id="root", included_node_ids=["a", "b"])
    ids = {n["id"] for n in filtered}

    assert ids == {"a", "b"}
