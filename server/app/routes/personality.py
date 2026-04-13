"""Personality test routes — design doc §3 & §9.2.

MBTI scoring: 4 dimensions × 5 questions, majority wins.
SBTI scoring: 15 dimensions × 2 questions, sum ≤3→L, =4→M, ≥5→H, euclidean match to 25 archetypes.
"""

import json
import math
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_database
from app.models.schemas import PersonalitySubmit
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/personality", tags=["Personality"])

# ── Load SBTI data from bundled asset ──
_SBTI_DATA: dict | None = None
SBTI_DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "sbti_data.json"


def _load_sbti() -> dict:
    global _SBTI_DATA
    if _SBTI_DATA is None:
        with open(SBTI_DATA_PATH, "r", encoding="utf-8") as f:
            _SBTI_DATA = json.load(f)
    return _SBTI_DATA


# ── MBTI questions (hackathon-themed, 20 questions) ──
MBTI_QUESTIONS = [
    # E/I — Energy source
    {"id": "ei1", "dim": "EI", "text": "在黑客松现场，你更可能？", "options": [
        {"value": "E", "label": "主动跟陌生人聊项目想法"}, {"value": "I", "label": "先观察，等别人来找你"}]},
    {"id": "ei2", "dim": "EI", "text": "组队讨论进行了 2 小时，你感觉？", "options": [
        {"value": "E", "label": "越聊越兴奋，想继续"}, {"value": "I", "label": "需要独处充电一会儿"}]},
    {"id": "ei3", "dim": "EI", "text": "午餐时间，你更想？", "options": [
        {"value": "E", "label": "和不同的人拼桌聊天"}, {"value": "I", "label": "找个安静角落吃饭思考"}]},
    {"id": "ei4", "dim": "EI", "text": "Demo 前夜大家在社交，你？", "options": [
        {"value": "E", "label": "穿梭各组串门取经"}, {"value": "I", "label": "待在自己工位调代码"}]},
    {"id": "ei5", "dim": "EI", "text": "活动结束后你更期待？", "options": [
        {"value": "E", "label": "After party 继续交流"}, {"value": "I", "label": "回去好好休息"}]},
    # S/N — Information
    {"id": "sn1", "dim": "SN", "text": "选项目方向时，你更关注？", "options": [
        {"value": "S", "label": "能不能在 48 小时内做出来"}, {"value": "N", "label": "这个想法够不够颠覆"}]},
    {"id": "sn2", "dim": "SN", "text": "队友提出一个大胆想法，你的第一反应？", "options": [
        {"value": "S", "label": "先想想技术上怎么实现"}, {"value": "N", "label": "顺着想法继续发散"}]},
    {"id": "sn3", "dim": "SN", "text": "写代码时你更倾向？", "options": [
        {"value": "S", "label": "先搭好结构，按计划推进"}, {"value": "N", "label": "先做个原型试试看效果"}]},
    {"id": "sn4", "dim": "SN", "text": "评委问「为什么选这个方向？」你更可能回答？", "options": [
        {"value": "S", "label": "我们调研了市场数据和用户需求"}, {"value": "N", "label": "我们看到了一个还没人做的可能性"}]},
    {"id": "sn5", "dim": "SN", "text": "项目遇到技术瓶颈，你？", "options": [
        {"value": "S", "label": "查文档找成熟方案"}, {"value": "N", "label": "想想有没有非常规解法"}]},
    # T/F — Decision
    {"id": "tf1", "dim": "TF", "text": "队内对技术方案有分歧，你觉得应该？", "options": [
        {"value": "T", "label": "比较各方案优劣，选最优的"}, {"value": "F", "label": "照顾每个人的想法，找折衷"}]},
    {"id": "tf2", "dim": "TF", "text": "一个队友的代码质量不高，你？", "options": [
        {"value": "T", "label": "直接指出问题并建议改进"}, {"value": "F", "label": "先肯定 ta 的努力，再委婉建议"}]},
    {"id": "tf3", "dim": "TF", "text": "Demo 时间不够，要砍功能，你的思路？", "options": [
        {"value": "T", "label": "砍掉投入产出比最低的"}, {"value": "F", "label": "看哪个功能是大家最有热情的"}]},
    {"id": "tf4", "dim": "TF", "text": "评价一个项目，你更看重？", "options": [
        {"value": "T", "label": "技术实现的深度和可行性"}, {"value": "F", "label": "解决的问题对人的价值"}]},
    {"id": "tf5", "dim": "TF", "text": "队长要你做不擅长的任务，你？", "options": [
        {"value": "T", "label": "分析效率，建议换人做更合理"}, {"value": "F", "label": "先尝试，不想让队长为难"}]},
    # J/P — Lifestyle
    {"id": "jp1", "dim": "JP", "text": "黑客松第一天，你的计划？", "options": [
        {"value": "J", "label": "拆任务、排优先级、定里程碑"}, {"value": "P", "label": "先搞起来，边做边调整"}]},
    {"id": "jp2", "dim": "JP", "text": "离 Demo 还剩 3 小时，你？", "options": [
        {"value": "J", "label": "按计划收尾，确保能演示"}, {"value": "P", "label": "还在加新功能，相信最后能搞定"}]},
    {"id": "jp3", "dim": "JP", "text": "项目中途发现更好的方向？", "options": [
        {"value": "J", "label": "太晚了，按原计划做完"}, {"value": "P", "label": "立刻转向，好想法不能浪费"}]},
    {"id": "jp4", "dim": "JP", "text": "你更喜欢的工作方式？", "options": [
        {"value": "J", "label": "每天有清晰的 to-do list"}, {"value": "P", "label": "根据状态和心情灵活安排"}]},
    {"id": "jp5", "dim": "JP", "text": "比赛结束后整理代码，你？", "options": [
        {"value": "J", "label": "当天就整理好 README 和文档"}, {"value": "P", "label": "等有空再说吧"}]},
]


def _score_mbti(answers: dict[str, str]) -> dict[str, Any]:
    """Score MBTI: majority per dimension."""
    counts: dict[str, dict[str, int]] = {
        "EI": {"E": 0, "I": 0},
        "SN": {"S": 0, "N": 0},
        "TF": {"T": 0, "F": 0},
        "JP": {"J": 0, "P": 0},
    }
    for q in MBTI_QUESTIONS:
        ans = answers.get(q["id"])
        if ans and ans in counts[q["dim"]]:
            counts[q["dim"]][ans] += 1

    result = ""
    for dim, pair in [("EI", ("E", "I")), ("SN", ("S", "N")), ("TF", ("T", "F")), ("JP", ("J", "P"))]:
        result += pair[0] if counts[dim][pair[0]] >= counts[dim][pair[1]] else pair[1]

    labels = {
        "ENTJ": "指挥官型", "ENTP": "辩论家型", "INTJ": "建筑师型", "INTP": "逻辑学家型",
        "ESTJ": "执行者型", "ESFJ": "执政官型", "ENFJ": "教导者型", "ENFP": "竞选者型",
        "ESTP": "企业家型", "ESFP": "表演者型", "ISTJ": "检查员型", "ISFJ": "保护者型",
        "ISTP": "鉴赏家型", "ISFP": "探险家型", "INFJ": "提倡者型", "INFP": "调停者型",
    }
    return {"test_type": "mbti", "result": result, "result_cn": labels.get(result, "")}


def _score_sbti(answers: dict[str, Any]) -> dict[str, Any]:
    """Score SBTI: 15 dimensions → H/M/L → euclidean match to 25 archetypes."""
    sbti = _load_sbti()
    questions = sbti["questions"]
    dimension_order = sbti["dimensionOrder"]  # 15 dims
    normal_types = sbti["normalTypes"]  # [{code, pattern}]
    type_library = sbti["typeLibrary"]  # {code: {code, cn, ...}}

    # Build dimension scores
    dim_sums: dict[str, int] = {}
    for q in questions:
        qid = q["id"]
        ans_val = answers.get(qid)
        if ans_val is None:
            continue
        dim = q.get("dim")
        if not dim:
            continue
        for opt in q.get("options", []):
            if opt.get("value") == ans_val or str(opt.get("value")) == str(ans_val):
                dim_sums[dim] = dim_sums.get(dim, 0) + int(opt["value"])
                break

    # Convert to H/M/L
    dim_hml: dict[str, str] = {}
    for dim in dimension_order:
        total = dim_sums.get(dim, 0)
        if total <= 3:
            dim_hml[dim] = "L"
        elif total == 4:
            dim_hml[dim] = "M"
        else:
            dim_hml[dim] = "H"

    # Check hidden trigger (DRUNK)
    trigger_qid = sbti.get("drunkTriggerQuestionId")
    special_qs = sbti.get("specialQuestions", [])
    if trigger_qid:
        hid_ans = answers.get(trigger_qid)
        trigger_q = next((sq for sq in special_qs if sq["id"] == trigger_qid), None)
        if trigger_q and hid_ans is not None:
            trigger_val = trigger_q.get("trigger_value", 3)
            if str(hid_ans) == str(trigger_val):
                drunk_type = type_library.get("DRUNK", {})
                return {
                    "test_type": "sbti",
                    "result": "DRUNK",
                    "result_cn": drunk_type.get("cn", "酒鬼"),
                    "sbti_dimensions": dim_hml,
                }

    # Parse archetype patterns and Euclidean distance matching
    hml_to_num = {"H": 5, "M": 4, "L": 3}
    user_vec = [hml_to_num.get(dim_hml.get(d, "M"), 4) for d in dimension_order]

    best_code = "HHHH"
    best_dist = float("inf")
    best_match_pct = 0.0

    for nt in normal_types:
        code = nt["code"]
        pattern = nt["pattern"]  # e.g. "HHH-HMH-MHH-HHH-MHM"
        letters = list(pattern.replace("-", ""))
        if len(letters) != len(dimension_order):
            continue
        arch_vec = [hml_to_num.get(c, 4) for c in letters]

        dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(user_vec, arch_vec)))
        max_dist = math.sqrt(len(user_vec) * (5 - 3) ** 2)
        pct = (1 - dist / max_dist) * 100 if max_dist > 0 else 0

        if dist < best_dist:
            best_dist = dist
            best_code = code
            best_match_pct = pct

    # HHHH fallback if < 60%
    if best_match_pct < 60:
        hhhh_type = type_library.get("HHHH", {})
        return {
            "test_type": "sbti",
            "result": "HHHH",
            "result_cn": hhhh_type.get("cn", "傻乐者"),
            "sbti_dimensions": dim_hml,
        }

    matched_type = type_library.get(best_code, {})
    return {
        "test_type": "sbti",
        "result": best_code,
        "result_cn": matched_type.get("cn", ""),
        "sbti_dimensions": dim_hml,
    }


# ── Endpoints ──

@router.get("/questions")
async def get_questions(type: str = Query(..., pattern="^(mbti|sbti)$")):
    if type == "mbti":
        return {"type": "mbti", "count": len(MBTI_QUESTIONS), "questions": MBTI_QUESTIONS}
    else:
        sbti = _load_sbti()
        questions = sbti.get("questions", [])
        special = sbti.get("specialQuestions", [])
        all_qs = questions + special
        return {"type": "sbti", "count": len(all_qs), "questions": all_qs}


@router.post("/submit")
async def submit_personality(data: PersonalitySubmit, user: dict = Depends(get_current_user)):
    if data.test_type == "mbti":
        result = _score_mbti(data.answers)
    elif data.test_type == "sbti":
        result = _score_sbti(data.answers)
    else:
        raise HTTPException(status_code=400, detail="Invalid test_type, must be 'mbti' or 'sbti'")

    db = get_database()
    # Store under both the specific key (mbti/sbti) and the generic personality field
    field_key = data.test_type  # "mbti" or "sbti"
    await db.users.update_one(
        {"uuid": user["uuid"]},
        {"$set": {field_key: result, "personality": result}},
    )
    return result
