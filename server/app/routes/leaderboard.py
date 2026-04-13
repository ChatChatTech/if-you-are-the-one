"""Leaderboard / hot list — aggregated stats for the 热榜 tab."""

from fastapi import APIRouter

from app.database import get_database

router = APIRouter(prefix="/api/leaderboard", tags=["Leaderboard"])


@router.get("")
async def get_leaderboard():
    db = get_database()

    # 1) Hottest bars — by message_count descending (active/cooling only)
    hot_bars = await db.bars.find(
        {"status": {"$in": ["active", "cooling"]}},
        {"topic": 1, "description": 1, "status": 1, "current_users": 1,
         "max_seats": 1, "message_count": 1},
    ).sort("message_count", -1).to_list(10)
    hot_bars_list = [
        {
            "id": str(b["_id"]),
            "topic": b.get("topic", ""),
            "description": b.get("description", ""),
            "status": b.get("status", ""),
            "user_count": len(b.get("current_users", [])),
            "max_seats": b.get("max_seats", 6),
            "message_count": b.get("message_count", 0),
        }
        for b in hot_bars
    ]

    # 2) Most patted people (被拍最多)
    most_patted_pipeline = [
        {"$group": {"_id": "$to_uuid", "total": {"$sum": "$count"}}},
        {"$sort": {"total": -1}},
        {"$limit": 10},
    ]
    most_patted_raw = await db.pats.aggregate(most_patted_pipeline).to_list(10)
    # Resolve nicknames
    patted_uuids = [r["_id"] for r in most_patted_raw]
    patted_users = {
        u["uuid"]: u.get("nickname", "")
        async for u in db.users.find(
            {"uuid": {"$in": patted_uuids}}, {"uuid": 1, "nickname": 1}
        )
    }
    most_patted = [
        {"uuid": r["_id"], "nickname": patted_users.get(r["_id"], "?"), "count": r["total"]}
        for r in most_patted_raw
    ]

    # 3) Most active patters (拍人最多)
    most_active_pipeline = [
        {"$group": {"_id": "$from_uuid", "total": {"$sum": "$count"}}},
        {"$sort": {"total": -1}},
        {"$limit": 10},
    ]
    most_active_raw = await db.pats.aggregate(most_active_pipeline).to_list(10)
    active_uuids = [r["_id"] for r in most_active_raw]
    active_users = {
        u["uuid"]: u.get("nickname", "")
        async for u in db.users.find(
            {"uuid": {"$in": active_uuids}}, {"uuid": 1, "nickname": 1}
        )
    }
    most_active = [
        {"uuid": r["_id"], "nickname": active_users.get(r["_id"], "?"), "count": r["total"]}
        for r in most_active_raw
    ]

    # 4) Hottest keywords — top tags by user count
    users = await db.users.find(
        {}, {"skill_offer": 1, "skill_want": 1, "interests": 1}
    ).to_list(500)
    tag_counts: dict[str, int] = {}
    for u in users:
        for tag in set(
            u.get("skill_offer", []) + u.get("skill_want", []) + u.get("interests", [])
        ):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    hot_tags = sorted(tag_counts.items(), key=lambda x: -x[1])[:15]
    hot_tags_list = [{"name": name, "count": count} for name, count in hot_tags]

    return {
        "hot_bars": hot_bars_list,
        "most_patted": most_patted,
        "most_active": most_active,
        "hot_tags": hot_tags_list,
    }
