#!/usr/bin/env bash
set -euo pipefail

API="http://localhost:3001"
PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1: $2"; }

check() {
  local label="$1" expected_code="$2" actual_code="$3" body="$4"
  if [[ "$actual_code" == "$expected_code" ]]; then
    ok "$label (HTTP $actual_code)"
  else
    fail "$label" "expected $expected_code, got $actual_code — $body"
  fi
}

jq_val() { echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$2',''))" 2>/dev/null; }

echo "════════════════════════════════════════"
echo "  Agent://Night  E2E Flow Test"
echo "════════════════════════════════════════"
echo ""

# ── Clean DB ──
echo "▸ Cleaning database..."
docker exec night-mongo mongosh -u night -p nightpass --authenticationDatabase admin agent_night \
  --eval "db.users.deleteMany({});db.bars.deleteMany({});db.messages.deleteMany({});db.pats.deleteMany({});db.personality_results.deleteMany({});db.agent_logs.deleteMany({})" \
  --quiet > /dev/null 2>&1
sleep 1
echo ""

# ═══════════════ 1. AUTH ═══════════════
echo "━━━ 1. Authentication ━━━"

echo "▸ 1.1 Register User A (Alice)"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Alice","email":"alice@night.io","password":"TestPass1"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Register Alice" 201 "$CODE" "$BODY"
TOKEN_A=$(jq_val "$BODY" access_token)

echo "▸ 1.2 Register User B (Bob)"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Bob","email":"bob@night.io","password":"TestPass2"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Register Bob" 201 "$CODE" "$BODY"
TOKEN_B=$(jq_val "$BODY" access_token)

echo "▸ 1.3 Duplicate email"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Dup","email":"alice@night.io","password":"TestPass3"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Duplicate email rejected" 409 "$CODE" "$BODY"

echo "▸ 1.4 Login Alice"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@night.io","password":"TestPass1"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Login Alice" 200 "$CODE" "$BODY"

echo "▸ 1.5 Login wrong password"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@night.io","password":"WrongPass"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Wrong password rejected" 401 "$CODE" "$BODY"
echo ""

# ═══════════════ 2. USER PROFILE ═══════════════
echo "━━━ 2. User Profile ━━━"

echo "▸ 2.1 Get own profile (Alice)"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/users/me" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get Alice profile" 200 "$CODE" "$BODY"
UUID_A=$(jq_val "$BODY" uuid)
echo "    UUID_A=$UUID_A"

echo "▸ 2.2 Get own profile (Bob)"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/users/me" \
  -H "Authorization: Bearer $TOKEN_B")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get Bob profile" 200 "$CODE" "$BODY"
UUID_B=$(jq_val "$BODY" uuid)
echo "    UUID_B=$UUID_B"

echo "▸ 2.3 Update Alice profile (add tagline)"
BODY=$(curl -s -w "\n%{http_code}" -X PATCH "$API/api/users/me" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"tagline":"I love neon lights"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Update Alice tagline" 200 "$CODE" "$BODY"

echo "▸ 2.4 Get Bob public profile (from Alice)"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/users/$UUID_B" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get Bob public profile" 200 "$CODE" "$BODY"

echo "▸ 2.5 Unauthenticated request"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/users/me")
CODE=$(echo "$BODY" | tail -1)
check "Unauth rejected" 401 "$CODE" ""
echo ""

# ═══════════════ 3. BARS ═══════════════
echo "━━━ 3. Bars (酒吧) ━━━"

echo "▸ 3.1 Create bar (Alice)"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/bars" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"Neon Lounge","topic":"AI & Cocktails","max_seats":6}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Create bar" 201 "$CODE" "$BODY"
BAR_ID=$(jq_val "$BODY" id)
echo "    BAR_ID=$BAR_ID"

echo "▸ 3.2 List bars"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/bars" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "List bars" 200 "$CODE" "$BODY"

echo "▸ 3.3 Get bar detail"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/bars/$BAR_ID" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get bar detail" 200 "$CODE" "$BODY"

echo "▸ 3.4 Bob joins bar"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/bars/$BAR_ID/join" \
  -H "Authorization: Bearer $TOKEN_B")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Bob joins bar" 200 "$CODE" "$BODY"

echo "▸ 3.5 Alice sends message"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/bars/$BAR_ID/messages" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from the neon side!"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Alice sends message" 201 "$CODE" "$BODY"

echo "▸ 3.6 Bob sends message"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/bars/$BAR_ID/messages" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"content":"Cheers! 🍻"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Bob sends message" 201 "$CODE" "$BODY"

echo "▸ 3.7 Get messages"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/bars/$BAR_ID/messages" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get messages" 200 "$CODE" "$BODY"
# Check we got 2 messages
MSG_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
if [[ "$MSG_COUNT" == "2" ]]; then
  ok "Message count = 2"
else
  fail "Message count" "expected 2, got $MSG_COUNT"
fi

echo "▸ 3.8 Bob leaves bar"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/bars/$BAR_ID/leave" \
  -H "Authorization: Bearer $TOKEN_B")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Bob leaves bar" 200 "$CODE" "$BODY"
echo ""

# ═══════════════ 4. PATS ═══════════════
echo "━━━ 4. Pats (拍一拍) ━━━"

echo "▸ 4.1 Alice pats Bob"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/pats/$UUID_B" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Alice pats Bob" 201 "$CODE" "$BODY"

echo "▸ 4.2 Alice pat quota for Bob"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/pats/quota/$UUID_B" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get pat quota" 200 "$CODE" "$BODY"
echo "    Quota: $BODY"

echo "▸ 4.3 Bob's received pats"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/pats/received" \
  -H "Authorization: Bearer $TOKEN_B")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Bob received pats" 200 "$CODE" "$BODY"

echo "▸ 4.4 Self-pat should fail"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/pats/$UUID_A" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Self-pat rejected" 400 "$CODE" "$BODY"
echo ""

# ═══════════════ 5. PERSONALITY ═══════════════
echo "━━━ 5. Personality Tests ━━━"

echo "▸ 5.1 Get MBTI questions"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/personality/questions?type=mbti" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get MBTI questions" 200 "$CODE" ""
Q_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "    Questions: $Q_COUNT"

echo "▸ 5.2 Submit MBTI answers"
MBTI_ANS='{"ei1":"E","ei2":"I","ei3":"E","ei4":"I","ei5":"E","sn1":"S","sn2":"N","sn3":"S","sn4":"N","sn5":"S","tf1":"T","tf2":"F","tf3":"T","tf4":"F","tf5":"T","jp1":"J","jp2":"P","jp3":"J","jp4":"P","jp5":"J"}'
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/personality/submit" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"test_type\":\"mbti\",\"answers\":$MBTI_ANS}")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Submit MBTI" 200 "$CODE" "$BODY"
MBTI_TYPE=$(jq_val "$BODY" result)
echo "    MBTI Result: $MBTI_TYPE"

echo "▸ 5.3 Get SBTI questions"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/personality/questions?type=sbti" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get SBTI questions" 200 "$CODE" ""
SQ_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "    Questions: $SQ_COUNT"

echo "▸ 5.4 Submit SBTI answers"
# Build SBTI answers dict from question IDs
SBTI_QS=$(curl -s "$API/api/personality/questions?type=sbti" -H "Authorization: Bearer $TOKEN_A")
SBTI_ANS=$(echo "$SBTI_QS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
qs=d.get('questions', d) if isinstance(d,dict) else d
ans={}
for q in qs:
    if isinstance(q,dict):
        opts=q.get('options',[])
        if opts:
            ans[q['id']]=opts[0]['value']
print(json.dumps(ans))
")
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/personality/submit" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"test_type\":\"sbti\",\"answers\":$SBTI_ANS}")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Submit SBTI" 200 "$CODE" "$BODY"
SBTI_TYPE=$(jq_val "$BODY" result)
echo "    SBTI Result: $SBTI_TYPE"

echo "▸ 5.5 Verify profile has personality"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/users/me" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
HAS_MBTI=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('mbti') else 'no')" 2>/dev/null || echo no)
HAS_SBTI=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('sbti') else 'no')" 2>/dev/null || echo no)
if [[ "$HAS_MBTI" == "yes" && "$HAS_SBTI" == "yes" ]]; then
  ok "Profile has MBTI + SBTI"
else
  fail "Profile personality" "mbti=$HAS_MBTI sbti=$HAS_SBTI"
fi
echo ""

# ═══════════════ 6. SHRIMP (Agent API) ═══════════════
echo "━━━ 6. Shrimp / Agent API (龙虾池) ━━━"

echo "▸ 6.1 Agent bind"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/shrimp/bind" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"owner_uuid\":\"$UUID_A\",\"agent_did\":\"did:anet:agent001\"}")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Agent bind" 200 "$CODE" "$BODY"

echo "▸ 6.2 Agent creates shrimp bar"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/shrimp/bars" \
  -H "X-Agent-DID: did:anet:agent001" \
  -H "Content-Type: application/json" \
  -d '{"topic":"Autonomous Agents","description":"Agent testing"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Agent creates shrimp bar" 201 "$CODE" "$BODY"
SBAR_ID=$(jq_val "$BODY" id)
echo "    SHRIMP_BAR_ID=$SBAR_ID"

echo "▸ 6.3 Agent sends message in shrimp bar"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/shrimp/bars/$SBAR_ID/speak" \
  -H "X-Agent-DID: did:anet:agent001" \
  -H "Content-Type: application/json" \
  -d '{"content":"Beep boop, hello humans!"}')
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Agent speaks in bar" 201 "$CODE" "$BODY"

# Register Bob's agent too so we can pinch between agents
curl -s -X POST "$API/api/shrimp/bind" \
  -H "Content-Type: application/json" \
  -d "{\"owner_uuid\":\"$UUID_B\",\"agent_did\":\"did:anet:agent002\"}" > /dev/null

echo "▸ 6.4 Agent pinches Bob's agent"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/shrimp/pinch?target_did=did:anet:agent002" \
  -H "X-Agent-DID: did:anet:agent001")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Agent pinches" 201 "$CODE" "$BODY"

echo "▸ 6.5 Get agent logs"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/shrimp/log/$UUID_A" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "Get agent logs" 200 "$CODE" "$BODY"
LOG_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "    Agent log entries: $LOG_COUNT"
echo ""

# ═══════════════ 7. EDGE CASES ═══════════════
echo "━━━ 7. Edge Cases ━━━"

echo "▸ 7.1 Invalid JSON body"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d 'not-json')
CODE=$(echo "$BODY" | tail -1)
check "Invalid JSON → 422" 422 "$CODE" ""

echo "▸ 7.2 Anonymous register (no email/password)"
BODY=$(curl -s -w "\n%{http_code}" -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"OnlyNick"}')
CODE=$(echo "$BODY" | tail -1)
check "Anonymous register → 201" 201 "$CODE" ""

echo "▸ 7.3 Invalid bar ID"
BODY=$(curl -s -w "\n%{http_code}" "$API/api/bars/not-a-valid-id" \
  -H "Authorization: Bearer $TOKEN_A")
CODE=$(echo "$BODY" | tail -1)
check "Invalid bar ID → 404" 404 "$CODE" ""

echo "▸ 7.4 Health check"
BODY=$(curl -s -w "\n%{http_code}" "$API/health")
CODE=$(echo "$BODY" | tail -1)
check "Health endpoint" 200 "$CODE" ""
echo ""

# ═══════════════ SUMMARY ═══════════════
echo "════════════════════════════════════════"
TOTAL=$((PASS+FAIL))
echo "  Results: $PASS/$TOTAL passed, $FAIL failed"
if [[ $FAIL -eq 0 ]]; then
  echo "  🎉 ALL TESTS PASSED"
else
  echo "  ⚠️  Some tests failed — check output above"
fi
echo "════════════════════════════════════════"

exit $FAIL
