"""Network graph endpoint — returns nodes + links for D3 force graph.

Builds a person-tag-bar tripartite graph:
- Person nodes (users)
- Tag nodes (skills/interests)
- Bar nodes (active/cooling bars as gathering circles)
- Links: person→tag, person→bar (if currently in bar)
Also returns recent messages per bar for floating chat bubbles.
"""

from fastapi import APIRouter

from app.database import get_database

router = APIRouter(prefix="/api/network", tags=["Network"])


@router.get("/tags/available")
async def get_available_tags():
    """Return all unique tags across all users, with counts, for autocomplete."""
    db = get_database()
    users = await db.users.find(
        {}, {"skill_offer": 1, "skill_want": 1, "interests": 1}
    ).to_list(500)
    tag_counts: dict[str, int] = {}
    for u in users:
        for tag in set(
            u.get("skill_offer", []) + u.get("skill_want", []) + u.get("interests", [])
        ):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    return [
        {"name": name, "count": count}
        for name, count in sorted(tag_counts.items(), key=lambda x: -x[1])
    ]


@router.get("/graph")
async def get_network_graph():
    db = get_database()

    # Fetch users
    users = await db.users.find(
        {},
        {
            "uuid": 1,
            "nickname": 1,
            "bio": 1,
            "avatar_url": 1,
            "avatar_config": 1,
            "skill_offer": 1,
            "skill_want": 1,
            "interests": 1,
            "personality": 1,
            "current_bar_id": 1,
        },
    ).to_list(500)

    # Fetch active/cooling bars
    bars = await db.bars.find(
        {"status": {"$in": ["active", "cooling"]}},
        {
            "topic": 1,
            "description": 1,
            "status": 1,
            "current_users": 1,
            "max_seats": 1,
            "message_count": 1,
        },
    ).to_list(100)

    # Fetch recent messages from each bar for chat bubbles
    bar_messages: dict[str, list] = {}
    for bar in bars:
        bar_id = str(bar["_id"])
        msgs = await db.messages.find(
            {"bar_id": bar_id},
            {"nickname": 1, "content": 1},
        ).sort("created_at", -1).to_list(8)
        bar_messages[bar_id] = [
            {"nickname": m.get("nickname", ""), "content": m.get("content", "")}
            for m in reversed(msgs)
        ]

    nodes = []
    links = []
    tag_counts: dict[str, int] = {}

    # Build bar nodes
    bar_user_map: dict[str, str] = {}  # uuid → bar_node_id
    for bar in bars:
        bar_id = str(bar["_id"])
        bar_node_id = f"b_{bar_id}"
        user_count = len(bar.get("current_users", []))
        nodes.append({
            "id": bar_node_id,
            "type": "bar",
            "bar_id": bar_id,
            "name": bar.get("topic", ""),
            "description": bar.get("description", ""),
            "status": bar.get("status", "active"),
            "user_count": user_count,
            "max_seats": bar.get("max_seats", 6),
            "message_count": bar.get("message_count", 0),
            "messages": bar_messages.get(bar_id, []),
        })
        # Map user UUIDs to this bar
        for uid in bar.get("current_users", []):
            bar_user_map[uid] = bar_node_id

    # Collect all tags first for counting
    for u in users:
        all_tags = set(
            u.get("skill_offer", []) + u.get("skill_want", []) + u.get("interests", [])
        )
        for tag in all_tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    # Build person nodes and links
    for u in users:
        person_id = f"p_{u['uuid']}"
        all_tags = set(
            u.get("skill_offer", []) + u.get("skill_want", []) + u.get("interests", [])
        )

        nodes.append({
            "id": person_id,
            "type": "person",
            "name": u.get("nickname", ""),
            "bio": u.get("bio", ""),
            "uuid": u["uuid"],
            "avatar_url": u.get("avatar_url", ""),
            "personality": u.get("personality"),
            "current_bar_id": u.get("current_bar_id"),
        })

        # Person → tag links
        for tag in all_tags:
            links.append({
                "source": person_id,
                "target": f"t_{tag}",
                "type": "person-tag",
            })

        # Person → bar link (if in a bar)
        bar_node = bar_user_map.get(u["uuid"])
        if bar_node:
            links.append({
                "source": person_id,
                "target": bar_node,
                "type": "person-bar",
            })

    # Build tag nodes
    for tag, count in tag_counts.items():
        nodes.append({
            "id": f"t_{tag}",
            "type": "tag",
            "name": tag,
            "count": count,
        })

    return {"nodes": nodes, "links": links}
