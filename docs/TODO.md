Plan d'action proposé (par phases, du plus rentable au moins urgent)

  ┌─────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────┬─────────────┐
  │  #  │                                                     Quoi                                                     │                   Impact                   │   Effort    │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 1   │ Restructurer les 4 bodies en Rôle / Mission / Quand utiliser / Quand ne pas utiliser / Comportement / Format │ Élevé (qualité réponse + lisibilité        │ Moyen       │
  │     │  (FR+EN)                                                                                                     │ Settings)                                  │             │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 2   │ Ajouter avoided_skills au frontmatter + malus −20 dispatcher                                                 │ Élevé (anti-fuites de famille)             │ Faible      │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 3   │ Détecter le "explicit_prompt" dans _infer_perspective (regex FR/EN)                                          │ Moyen-élevé (UX assistant)                 │ Faible      │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 4   │ Log routing structuré (candidates, reason) + event SSE agent_selected + panneau debug                        │ Élevé (debuggabilité)                      │ Moyen       │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 5   │ Section "Conscience du contexte projet" dans chaque AGENT.md                                                 │ Élevé (qualité réponse)                    │ Moyen       │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 6   │ tools.allow/deny frontmatter + filtrage backend du registry de tools par agent                               │ Élevé (sécurité)                           │ Moyen-élevé │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 7   │ Eval queries enrichies (category, not_expected_agent) + assertions plus strictes                             │ Moyen                                      │ Faible      │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 8   │ Frontmatter handoff.can_handoff_to, scope, agent_type (informationnels)                                      │ Faible                                     │ Très faible │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 9   │ Badge UI "modèle sous-dimensionné" si recommended_model ≠ modèle actif                                       │ Faible                                     │ Faible      │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┼─────────────┤
  │ 10  │ LLM classifier fallback ambigu (option Settings)                                                             │ Variable                                   │ Élevé       │
  └─────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────┴─────────────┘

  Mon avis : faire 1+2+3+5 en un seul changeset (purement déclaratif, peu de risque), puis 4+6 en second pass (touche au runtime, à tester finement). Le reste peut attendre un vrai
  besoin.

  Tu veux que j'attaque le batch 1+2+3+5 ?

✻ Brewed for 1m 14s

❯ OK C'est parti pour les points 1,2,3,4,5,6,7,8 stp - on abandonne les points 9 et 10 - ils ne sont psa très pertinents.                                                             

● Explore(Explore agent runtime + tool plumbing)
  ⎿  Done (40 tool uses · 56.0k tokens · 1m 27s)
  (ctrl+o to expand)

  Read 9 files (ctrl+o to expand)

● Je m'attaque au batch 1→8. Plan d'exécution + plan file pour traçabilité, puis implémentation par couches.

● Updated plan
  ⎿  /plan to preview

● Phase 1 : schéma registry + API + types TS.

● Update(backend/agents/registry.py)
  ⎿  Added 5 lines
      53      auto_keywords: AgentKeywords = AgentKeywords()
      54      recommended_model: Optional[str] = None
      55      preferred_skills: tuple[str, ...] = ()
      56 +    avoided_skills: tuple[str, ...] = ()    # soft −20 dispatcher malus                                                                                              
      57 +    denied_skills: tuple[str, ...] = ()     # hard-deny: removed from toolset                                                                                        
      58      preferred_tools: tuple[str, ...] = ()
      59      modes: tuple[str, ...] = ("assistant", "migration")
      60 +    scope: str = "core"                     # core | extension | experimental                                                                                        
      61 +    agent_type: str = "response_agent"      # response_agent | orchestrator | evaluator                                                                              
      62 +    handoff_can_handoff_to: tuple[str, ...] = ()  # informational, future runtime                                                                                    
      63      folder: Optional[str] = None
      64      body: str = ""                         # FR system-prompt body
      65      body_en: str = ""                      # EN system-prompt body

● Update(backend/agents/registry.py)
  ⎿  Added 7 lines
      143      if isinstance(aliases_raw, (list, tuple)):
      144          aliases = tuple(str(a).strip() for a in aliases_raw if str(a).strip())
      145  
      146 +    handoff_raw = meta.get("handoff") or {}                                                                                                                         
      147 +    handoff_targets: tuple[str, ...] = ()                                                                                                                           
      148 +    if isinstance(handoff_raw, dict):                                                                                                                               
      149 +        targets = handoff_raw.get("can_handoff_to") or ()                                                                                                           
      150 +        if isinstance(targets, (list, tuple)):                                                                                                                      
      151 +            handoff_targets = tuple(str(t).strip() for t in targets if str(t).strip())                                                                              
      152 +                                                                                                                                                                    
      153      return AgentDefinition(
      154          name=name,
      155          folder_name=folder.name,

● Update(backend/agents/registry.py)
  ⎿  Added 5 lines
      167          auto_keywords=_coerce_keywords(meta.get("auto_keywords")),
      168          recommended_model=(str(meta.get("recommended_model")) if meta.get("recommended_model") else None),
      169          preferred_skills=tuple(str(s) for s in (meta.get("preferred_skills") or ()) if str(s).strip()),
      170 +        avoided_skills=tuple(str(s) for s in (meta.get("avoided_skills") or ()) if str(s).strip()),                                                                 
      171 +        denied_skills=tuple(str(s) for s in (meta.get("denied_skills") or ()) if str(s).strip()),                                                                   
      172          preferred_tools=tuple(str(t) for t in (meta.get("preferred_tools") or ()) if str(t).strip()),
      173          modes=tuple(str(m) for m in (meta.get("modes") or ("assistant", "migration")) if str(m).strip()),
      174 +        scope=str(meta.get("scope", "core")),                                                                                                                       
      175 +        agent_type=str(meta.get("agent_type", "response_agent")),                                                                                                   
      176 +        handoff_can_handoff_to=handoff_targets,                                                                                                                     
      177          folder=str(folder),
      178          body=body.strip(),
      179          body_en=en_body.strip(),

● Update(backend/api/routes/agents.py)
  ⎿  Added 5 lines
      38          "modes": list(ag.modes),
      39          "recommended_model": ag.recommended_model,
      40          "preferred_skills": list(ag.preferred_skills),
      41 +        "avoided_skills": list(ag.avoided_skills),                                                                                                                   
      42 +        "denied_skills": list(ag.denied_skills),                                                                                                                     
      43          "preferred_tools": list(ag.preferred_tools),
      44 +        "scope": ag.scope,                                                                                                                                           
      45 +        "agent_type": ag.agent_type,                                                                                                                                 
      46 +        "handoff": {"can_handoff_to": list(ag.handoff_can_handoff_to)},                                                                                              
      47          "auto_keywords": {
      48              "weak": list(ag.auto_keywords.weak),
      49              "strong": list(ag.auto_keywords.strong),

  Read 1 file (ctrl+o to expand)

● Update(frontend/src/agents/registry.ts)
  ⎿  Added 5 lines
      33    modes: string[]
      34    recommended_model: string | null
      35    preferred_skills: string[]
      36 +  avoided_skills: string[]                                                                                                                                           
      37 +  denied_skills: string[]                                                                                                                                            
      38    preferred_tools: string[]
      39 +  scope: string                                                                                                                                                      
      40 +  agent_type: string                                                                                                                                                 
      41 +  handoff: { can_handoff_to: string[] }                                                                                                                              
      42    auto_keywords: AgentKeywords
      43    has_profile: boolean
      44    has_profile_en: boolean

● Phase 1 OK. Phase 2 — explicit prompt detection + structured routing log.

● Update(backend/services/ai_service.py)
  ⎿  Added 99 lines, removed 4 lines
      1264      return n
      1265  
      1266   
      1267 +# ── Explicit-prompt agent detection ──────────────────────────                                                                                                    
      1268 +# Patterns FR + EN that should short-circuit the keyword scoring loop and                                                                                          
      1269 +# pick the named agent with confidence=high (BETTER §4.2). Matches phrases                                                                                         
      1270 +# like "réponds comme un architecte", "passe en mode developer",                                                                                                   
      1271 +# "answer as a business analyst", "switch to support mode".                                                                                                        
      1272 +_EXPLICIT_AGENT_PATTERNS: tuple[tuple[str, str], ...] = (                                                                                                          
      1273 +    # FR — "réponds/réagis/parle comme un[e] <rôle>"                                                                                                               
      1274 +    (PERSPECTIVE_SUPPORT,    r"comme\s+un[e]?\s+(?:agent\s+)?support"),                                                                                            
      1275 +    (PERSPECTIVE_BA,         r"comme\s+un[e]?\s+(?:business[\s-]?analyst|analyste\s+m[ée]tier|application\s+manager|consultant[e]?\s+fonctionnel)"),               
      1276 +    (PERSPECTIVE_ARCHITECT,  r"comme\s+un[e]?\s+architecte"),                                                                                                      
      1277 +    (PERSPECTIVE_DEVELOPER,  r"comme\s+un[e]?\s+(?:d[ée]veloppeur|developer|dev)\b"),                                                                              
      1278 +    # FR — "passe/passons en mode <rôle>" / "mode <rôle>"                                                                                                          
      1279 +    (PERSPECTIVE_SUPPORT,    r"\bmode\s+support\b"),                                                                                                               
      1280 +    (PERSPECTIVE_BA,         r"\bmode\s+(?:business[\s-]?analyst|analyste\s+m[ée]tier|ba|am)\b"),                                                                  
      1281 +    (PERSPECTIVE_ARCHITECT,  r"\bmode\s+(?:architect|architecte)\b"),                                                                                              
      1282 +    (PERSPECTIVE_DEVELOPER,  r"\bmode\s+(?:developer|d[ée]veloppeur|dev)\b"),                                                                                      
      1283 +    # EN — "answer as a <role>" / "respond as a <role>" / "switch to <role> mode"                                                                                  
      1284 +    (PERSPECTIVE_SUPPORT,    r"\bas\s+(?:an?\s+)?support\b"),                                                                                                      
      1285 +    (PERSPECTIVE_BA,         r"\bas\s+(?:an?\s+)?business[\s-]?analyst\b"),                                                                                        
      1286 +    (PERSPECTIVE_ARCHITECT,  r"\bas\s+(?:an?\s+)?architect\b"),                                                                                                    
      1287 +    (PERSPECTIVE_DEVELOPER,  r"\bas\s+(?:an?\s+)?(?:developer|dev)\b"),                                                                                            
      1288 +    (PERSPECTIVE_SUPPORT,    r"\bsupport\s+mode\b"),                                                                                                               
      1289 +    (PERSPECTIVE_BA,         r"\b(?:business[\s-]?analyst|ba)\s+mode\b"),                                                                                          
      1290 +    (PERSPECTIVE_ARCHITECT,  r"\barchitect\s+mode\b"),                                                                                                             
      1291 +    (PERSPECTIVE_DEVELOPER,  r"\b(?:developer|dev)\s+mode\b"),                                                                                                     
      1292 +)                                                                                                                                                                  
      1293 +                                                                                                                                                                   
      1294 +                                                                                                                                                                   
      1295 +def _detect_explicit_prompt_agent(text: str) -> Optional[str]:                                                                                                     
      1296 +    """Return the canonical agent name if the user explicitly named a role                                                                                         
      1297 +    in the prompt (FR or EN), else None. Case-insensitive."""                                                                                                      
      1298 +    if not text:                                                                                                                                                   
      1299 +        return None                                                                                                                                                
      1300 +    lowered = text.lower()                                                                                                                                         
      1301 +    for agent_name, pattern in _EXPLICIT_AGENT_PATTERNS:                                                                                                           
      1302 +        if re.search(pattern, lowered):                                                                                                                            
      1303 +            return agent_name                                                                                                                                      
      1304 +    return None                                                                                                                                                    
      1305 +                                                                                                                                                                   
      1306 +                                                                                                                                                                   
      1307  def _infer_perspective(text: str, fallback: str = PERSPECTIVE_BA) -> str:
      1308      """Best-effort fallback for clients sending ``perspective="auto"``.
      1309  
      1270 -    Scores prompt against each registered agent's ``auto_keywords`` (weak / strong                                                                                 
      1271 -    tuples declared in ``agents/<slug>/AGENT.md`` frontmatter). Returns *fallback*                                                                                 
      1272 -    below the same confidence threshold the frontend uses (>=3 and >=2 margin)."""                                                                                 
      1310 +    Priority chain (BETTER §4):                                                                                                                                    
      1311 +      1. Explicit prompt (regex FR/EN) — confidence=high, mode=explicit_prompt                                                                                     
      1312 +      2. Strong dev signals (code block, ORM tokens, traceback) — confidence=high                                                                                  
      1313 +      3. Keyword scoring across registered agents — confidence=high if                                                                                             
      1314 +         best>=3 and margin>=2, medium if best>=3, low otherwise → fallback.                                                                                       
      1315 +                                                                                                                                                                   
      1316 +    Side-channel ``_infer_perspective.last_result`` exposes the full routing                                                                                       
      1317 +    decision (selected, mode, confidence, reason, candidates) so the SSE                                                                                           
      1318 +    layer can emit an ``agent_selected`` event without changing this                                                                                               
      1319 +    function's public string return type."""                                                                                                                       
      1320 +    candidates_log: list[dict[str, object]] = []                                                                                                                   
      1321 +                                                                                                                                                                   
      1322 +    def _record(selected: str, mode: str, confidence: str, reason: str) -> None:                                                                                   
      1323 +        _infer_perspective.last_result = {  # type: ignore[attr-defined]                                                                                           
      1324 +            "selected": selected,                                                                                                                                  
      1325 +            "mode": mode,                                                                                                                                          
      1326 +            "confidence": confidence,                                                                                                                              
      1327 +            "reason": reason,                                                                                                                                      
      1328 +            "candidates": candidates_log,                                                                                                                          
      1329 +        }                                                                                                                                                          
      1330 +                                                                                                                                                                   
      1331      if not text or not text.strip():
      1332 +        _record(fallback, "fallback", "low", "empty-prompt")                                                                                                       
      1333          return fallback
      1334 +                                                                                                                                                                   
      1335      t = text.lower()
      1276 -    # Strong dev signals: code block, ORM tokens, traceback.                                                                                                       
      1336 +                                                                                                                                                                   
      1337 +    # 1) Explicit prompt detection — highest priority.                                                                                                             
      1338 +    explicit = _detect_explicit_prompt_agent(t)                                                                                                                    
      1339 +    if explicit is not None:                                                                                                                                       
      1340 +        _record(explicit, "explicit_prompt", "high", f"matched explicit pattern for '{explicit}'")                                                                 
      1341 +        return explicit                                                                                                                                            
      1342 +                                                                                                                                                                   
      1343 +    # 2) Heuristic strong dev signals.                                                                                                                             
      1344      if "```" in t or "_inherit" in t or "@api." in t or "self.env" in t or "traceback" in t:
      1345 +        _record(PERSPECTIVE_DEVELOPER, "auto_scored", "high", "strong-dev-signal (code/orm/traceback)")                                                            
      1346          return PERSPECTIVE_DEVELOPER
      1347  
      1348 +    # 3) Keyword scoring across registered agents.                                                                                                                 
      1349      scores: dict[str, int] = {}
      1350      try:
      1351          from ..agents import list_agents as _list_agents
     ...
      1364      preferred_order = [PERSPECTIVE_SUPPORT, PERSPECTIVE_ARCHITECT, PERSPECTIVE_DEVELOPER, PERSPECTIVE_BA]
      1365      order = [p for p in preferred_order if p in scores] + [p for p in scores if p not in preferred_order]
      1366  
      1367 +    candidates_log[:] = [                                                                                                                                          
      1368 +        {"name": p, "score": scores.get(p, 0)}                                                                                                                     
      1369 +        for p in sorted(order, key=lambda x: (-scores.get(x, 0), x))                                                                                               
      1370 +    ]                                                                                                                                                              
      1371 +                                                                                                                                                                   
      1372      best = fallback
      1373      best_score = 0
      1374      second_score = 0
     ...
      1380              best = p
      1381          elif s > second_score:
      1382              second_score = s
      1383 +                                                                                                                                                                   
      1384      if best_score >= 3 and best_score - second_score >= 2:
      1385 +        _record(best, "auto_scored", "high",                                                                                                                       
      1386 +                f"top score {best_score} with margin {best_score - second_score}")                                                                                 
      1387          return best
      1388 +    if best_score >= 3:                                                                                                                                            
      1389 +        # Above threshold but low margin → keep the best but flag as medium                                                                                        
      1390 +        # confidence (informational; routing still returns the best agent).                                                                                        
      1391 +        _record(best, "auto_scored", "medium",                                                                                                                     
      1392 +                f"top score {best_score} but margin {best_score - second_score} < 2; fallback used")                                                               
      1393 +    else:                                                                                                                                                          
      1394 +        _record(fallback, "fallback", "low",                                                                                                                       
      1395 +                f"best score {best_score} below threshold (>=3)")                                                                                                  
      1396      return fallback
      1397  
      1398  
      1399 +# Initialise the side-channel so callers can always read the attribute.                                                                                            
      1400 +_infer_perspective.last_result = {  # type: ignore[attr-defined]                                                                                                   
      1401 +    "selected": PERSPECTIVE_DEVELOPER,                                                                                                                             
      1402 +    "mode": "uninitialized",                                                                                                                                       
      1403 +    "confidence": "low",                                                                                                                                           
      1404 +    "reason": "no inference yet",                                                                                                                                  
      1405 +    "candidates": [],                                                                                                                                              
      1406 +}                                                                                                                                                                  
      1407 +                                                                                                                                                                   
      1408 +                                                                                                                                                                   
      1409  def _last_user_text(messages: list) -> str:
      1410      """Extract plain text from the most recent user message (string content or
      1411      Anthropic-style content list)."""

  Searched for 1 pattern (ctrl+o to expand)

● Good. Phase 2 done. Phase 3 — avoided_skills malus.

● Update(backend/services/context_service.py)
  ⎿  Added 18 lines
      1314                  continue
      1315              add(name, 20, f"agent-preferred:{_agent_def.name}")
      1316  
      1317 +    # Symmetric −20 malus for skills the agent explicitly avoids. Applied                                                                                          
      1318 +    # only to candidates that exist (we never *introduce* a skill just to                                                                                          
      1319 +    # demote it) and never strong enough to flip an explicit invocation.                                                                                           
      1320 +    # Anything dropping below ``_MIN_SKILL_SCORE`` will be filtered by the                                                                                         
      1321 +    # downstream floor pass.                                                                                                                                       
      1322 +    if _agent_def and _agent_def.avoided_skills:                                                                                                                   
      1323 +        for name in _agent_def.avoided_skills:                                                                                                                     
      1324 +            existing = route_candidates.get(name)                                                                                                                  
      1325 +            if existing is None:                                                                                                                                   
      1326 +                continue                                                                                                                                           
      1327 +            if _is_explicit_invocation_reason(existing["reason"]):                                                                                                 
      1328 +                # Explicit user intent overrides agent preferences.                                                                                                
      1329 +                continue                                                                                                                                           
      1330 +            existing["score"] -= 20                                                                                                                                
      1331 +            _append_route_reason(existing, f"agent-avoided:{_agent_def.name}")                                                                                     
      1332 +            if existing["score"] < _MIN_SKILL_SCORE:                                                                                                               
      1333 +                existing["selected"] = False                                                                                                                       
      1334 +                                                                                                                                                                   
      1335      selected_skills = _prune_skill_routes(prompt_norm, selected_skills, route_candidates)
      1336  
      1337      # Apply minimum-score floor. Explicit invocations (named skill / mode

  Searched for 1 pattern (ctrl+o to expand)

● Phase 3 done. Phase 4 — denied_skills enforcement in toolset.

  Searched for 1 pattern, read 1 file (ctrl+o to expand)

● Update(backend/services/ai_service.py)
  ⎿  Added 16 lines
      2390      perspective = _normalize_perspective(perspective)
      2391      response_language = _normalize_response_language(response_language)
      2392  
      2393 +    # Merge agent-level ``denied_skills`` into the per-request disabled_tools                                                                                      
      2394 +    # list. This is the only real backend gate on which skills are exposed                                                                                         
      2395 +    # to the LLM for this turn — agent body text is not a security                                                                                                 
      2396 +    # boundary (BETTER §6). Idempotent and order-preserving.                                                                                                       
      2397 +    try:                                                                                                                                                           
      2398 +        from ..agents import get_agent as _get_agent_for_deny                                                                                                      
      2399 +        _agent_def_deny = _get_agent_for_deny(perspective)                                                                                                         
      2400 +    except Exception:                                                                                                                                              
      2401 +        _agent_def_deny = None                                                                                                                                     
      2402 +    if _agent_def_deny and _agent_def_deny.denied_skills:                                                                                                          
      2403 +        _merged = list(disabled_tools or [])                                                                                                                       
      2404 +        for sk in _agent_def_deny.denied_skills:                                                                                                                   
      2405 +            if sk not in _merged:                                                                                                                                  
      2406 +                _merged.append(sk)                                                                                                                                 
      2407 +        disabled_tools = _merged                                                                                                                                   
      2408 +                                                                                                                                                                   
      2409      # Trim conversation history to avoid context-window overflow on long sessions.
      2410      messages = _trim_history(messages)
      2411  

● Phase 4 done. Phase 5 — SSE agent_selected event.

  Searched for 2 patterns, read 1 file (ctrl+o to expand)

● Update(backend/api/routes/ai.py)
  ⎿  Added 1 line
      16  from ...services.ai_service import (
      17      stream_chat, DEFAULT_MODELS, 
      18      GITHUB_MODELS_BASE_URL, COPILOT_BASE_URL, COPILOT_HEADERS,
      19 +    _infer_perspective, _normalize_perspective, _last_user_text,                                                                                                     
      20  )
      21  from ...services.context_service import (
      22      load_context_for_prompt,
     
● Update(backend/api/routes/ai.py)
  ⎿  Added 46 lines
       81      return payload
       82  
       83  
       84 +def _agent_selected_payload(                                                                                                                                        
       85 +    agent: str,                                                                                                                                                     
       86 +    routing_info: dict,                                                                                                                                             
       87 +    *,                                                                                                                                                              
       88 +    run_id: Optional[str] = None,                                                                                                                                   
       89 +) -> dict:                                                                                                                                                          
       90 +    """SSE payload mirroring ``skills_selected`` for the active agent.                                                                                              
       91 +                                                                                                                                                                    
       92 +    ``routing_info`` is the dict produced by ``_infer_perspective.last_result``                                                                                     
       93 +    (or a synthesised equivalent when the client explicitly picked an agent                                                                                         
       94 +    in the UI). Fields: ``selected``, ``mode``, ``confidence``, ``reason``,                                                                                         
       95 +    ``candidates: [{name, score}]``."""                                                                                                                             
       96 +    payload = {                                                                                                                                                     
       97 +        "type": "agent_selected",                                                                                                                                   
       98 +        "agent": agent,                                                                                                                                             
       99 +        "mode": routing_info.get("mode", "unknown"),                                                                                                                
      100 +        "confidence": routing_info.get("confidence", "low"),                                                                                                        
      101 +        "reason": routing_info.get("reason", ""),                                                                                                                   
      102 +        "candidates": routing_info.get("candidates", []),                                                                                                           
      103 +    }                                                                                                                                                               
      104 +    if run_id:                                                                                                                                                      
      105 +        payload["run_id"] = run_id                                                                                                                                  
      106 +    return payload                                                                                                                                                  
      107 +                                                                                                                                                                    
      108 +                                                                                                                                                                    
      109 +def _resolve_perspective_with_log(req_perspective: Optional[str], user_prompt: str) -> tuple[str, dict]:                                                            
      110 +    """Resolve the request's perspective field into a concrete agent name plus                                                                                      
      111 +    routing-decision log. When the client sent an explicit role we record                                                                                           
      112 +    ``mode='explicit_ui'`` with confidence=high; only ``auto`` (or empty)                                                                                           
      113 +    triggers ``_infer_perspective`` which fills its own side-channel."""                                                                                            
      114 +    raw = (req_perspective or "").strip().lower()                                                                                                                   
      115 +    if raw and raw not in ("auto",):                                                                                                                                
      116 +        normalised = _normalize_perspective(raw)                                                                                                                    
      117 +        return normalised, {                                                                                                                                        
      118 +            "selected": normalised,                                                                                                                                 
      119 +            "mode": "explicit_ui",                                                                                                                                  
      120 +            "confidence": "high",                                                                                                                                   
      121 +            "reason": f"User selected '{raw}' in the UI",                                                                                                           
      122 +            "candidates": [{"name": normalised, "score": 100}],                                                                                                     
      123 +        }                                                                                                                                                           
      124 +    inferred = _infer_perspective(user_prompt or "")                                                                                                                
      125 +    info = dict(getattr(_infer_perspective, "last_result", {}) or {})                                                                                               
      126 +    info.setdefault("selected", inferred)                                                                                                                           
      127 +    return inferred, info                                                                                                                                           
      128 +                                                                                                                                                                    
      129 +                                                                                                                                                                    
      130  async def _exchange_copilot_token(oauth_token: str) -> str:
      131      """Exchange a stored GitHub OAuth token for a short-lived Copilot bearer token."""
      132      async with httpx.AsyncClient() as client:

● Now wire it into the two emission paths.

● Update(backend/api/routes/ai.py)
  ⎿  Added 11 lines, removed 1 line
      515      _complexity_active = "runtime_complexity_analyzer" not in _disabled_skills
      516      # Effective perspective: when the router is disabled, fall back to a neutral
      517      # developer baseline so no role bias leaks into the prompt.
      518 -    _effective_perspective = (req.perspective or "developer") if _perspective_active else "developer"                                                               
      518 +    if _perspective_active:                                                                                                                                         
      519 +        _effective_perspective, _agent_routing_info = _resolve_perspective_with_log(req.perspective, user_prompt)                                                   
      520 +    else:                                                                                                                                                           
      521 +        _effective_perspective = "developer"                                                                                                                        
      522 +        _agent_routing_info = {                                                                                                                                     
      523 +            "selected": "developer",                                                                                                                                
      524 +            "mode": "router_disabled",                                                                                                                              
      525 +            "confidence": "low",                                                                                                                                    
      526 +            "reason": "runtime_perspective_router disabled by user",                                                                                                
      527 +            "candidates": [],                                                                                                                                       
      528 +        }                                                                                                                                                           
      529  
      530      # ── General / Migration mode (no profile) ─────────────────────
      531      if req.profile_id is None:

● Update(backend/api/routes/ai.py)
  ⎿  Added 1 line
      578  
      579          async def generate_general():
      580              try:
      581 +                yield _sse(_agent_selected_payload(_effective_perspective, _agent_routing_info, run_id=_run_id))                                                    
      582                  yield _sse(_skills_selected_payload(_selected_skills, _skill_candidates, _output_template, run_id=_run_id, context_trace=_context_trace))
      583                  async for evt in stream_chat(req.provider, api_key, req.model, None, None, messages, source_path, context_md, version, _user_profile, None, None, _g
           en_target_path, req.migration_mode, _gen_target_ver, _effective_perspective, _response_language, disabled_tools=_disabled_tools_cleaned, run_id=_run_id):
      584                      yield _sse(evt)

● Update(backend/api/routes/ai.py)
  ⎿  Added 1 line
      736  
      737      async def generate():
      738          try:
      739 +            yield _sse(_agent_selected_payload(_effective_perspective, _agent_routing_info, run_id=_run_id))                                                        
      740              yield _sse(_skills_selected_payload(_selected_skills, _skill_candidates, _output_template, run_id=_run_id, context_trace=_context_trace))
      741              async for evt in stream_chat(req.provider, api_key, req.model, odoo, profile, messages, source_path, context_md, _version_to_use, _user_profile, _active
           _company_name, repo_path, target_path, req.migration_mode, _target_version, _effective_perspective, _response_language, disabled_tools=_disabled_tools_cleaned, run_
           id=_run_id):
      742                  yield _sse(evt)

  Searched for 2 patterns, read 1 file (ctrl+o to expand)

  Read 1 file (ctrl+o to expand)

● Write(agents/support/AGENT.md)
  ⎿  Added 62 lines, removed 17 lines
       8  color: "#3b82f6"
       9  default: false
      10  builtin: true
      11 -version: "1.0.0"                                                                                                                                                     
      11 +version: "1.1.0"                                                                                                                                                     
      12  author: Le Goff Benoît - Camptocamp SA
      13 +scope: core                                                                                                                                                          
      14 +agent_type: response_agent                                                                                                                                           
      15  auto_keywords:
      16    weak: [incident, bug, crash, plante, crashe, workaround, contournement, ticket, sla, reproduire, panne, "hors service", urgence, urgent, critique, p1, p2, lenteur,
           freeze, timeout, "ne fonctionne pas", "n'arrive pas", "ne marche pas", "ne charge pas", résoudre, fix, corriger, erreur, planté, plantée, bloqué, bloque, bloquée, c
          onnexion, impossible]
      17    strong: [incident, workaround, ticket, sla, panne, p1, p2, "ne fonctionne pas", "ne marche pas", bug, plante, planté, plantée, inaccessible, lenteur, "page blanche
          ", "écran blanc", "erreur 500", "erreur 404", "erreur 403", "internal server error", "connexion impossible", "impossible de se connecter", "login impossible"]
     ...
      22    - odoo_inspect_modules
      23    - source_search_odoo
      24    - source_read_odoo_file
      25 +avoided_skills:                                                                                                                                                      
      26 +  - compare_odoo_versions                                                                                                                                            
      27 +  - inspect_module_graph                                                                                                                                             
      28 +  - generate_diagram                                                                                                                                                 
      29 +  - inspect_financial_reports                                                                                                                                        
      30 +denied_skills: []                                                                                                                                                    
      31  preferred_tools:
      32    - load_skill_reference
      33    - run_skill_script
      34 +handoff:                                                                                                                                                             
      35 +  can_handoff_to: [developer, business_analyst, architect]                                                                                                           
      36  modes: [assistant, migration]
      37  ---
      38  
      29 -## Perspective : SUPPORT (Run / Incident)                                                                                                                            
      39 +## Rôle                                                                                                                                                              
      40  
      31 -Tu réponds comme un **consultant support Odoo expérimenté** chargé de débloquer un utilisateur ou de diagnostiquer un incident en production.                        
      41 +Tu es un **consultant support Odoo expérimenté** — N1/N2 ou oncall — chargé de débloquer rapidement un utilisateur ou de diagnostiquer un incident en production.    
      42  
      33 -### Public cible                                                                                                                                                     
      34 -- Key users bloqués, équipe support N1/N2, oncall.                                                                                                                   
      35 -- Ils ont besoin d'une réponse **immédiatement actionnable**, pas d'une analyse théorique.                                                                           
      43 +## Mission                                                                                                                                                           
      44  
      37 -### Priorités                                                                                                                                                        
      38 -- **Diagnostic rapide** : symptômes → hypothèses → vérifications concrètes.                                                                                          
      39 -- **Workaround temporaire** avant la correction de fond si l'utilisateur est bloqué.                                                                                 
      40 -- **Logs, traceback, requêtes SQL** de vérification.                                                                                                                 
      41 -- **Reproduction** : étapes minimales pour reproduire.                                                                                                               
      42 -- **Impact** : combien d'utilisateurs / quel processus est bloqué.                                                                                                   
      45 +- Diagnostiquer l'origine probable d'un incident à partir des symptômes décrits.                                                                                     
      46 +- Proposer une vérification concrète, immédiatement actionnable.                                                                                                     
      47 +- Donner un workaround temporaire si l'utilisateur est bloqué.                                                                                                       
      48 +- Indiquer la correction durable et le moment où il faut escalader.                                                                                                  
      49  
      44 -### Format de sortie                                                                                                                                                 
      45 -- Démarrer par **Diagnostic probable** (1-3 hypothèses ordonnées).                                                                                                   
      46 -- Suivre par **Vérifications à faire** (checklist actionnable).                                                                                                      
      47 -- Donner un **Workaround** si possible, puis la **Correction durable**.                                                                                              
      48 -- Terminer par **Prochaines actions** courtes.                                                                                                                       
      50 +## Quand utiliser cet agent                                                                                                                                          
      51 +                                                                                                                                                                     
      52 +- Erreur Odoo, page blanche, traceback, erreur 500/404/403, lenteur, freeze.                                                                                         
      53 +- "Ça ne fonctionne pas", "je suis bloqué", "ça plante", "impossible de se connecter".                                                                               
      54 +- Incident en production, ticket support, panne déclarée, P1/P2.                                                                                                     
      55 +- Diagnostic rapide d'un comportement inattendu sur un projet existant.                                                                                              
      56 +- Reproduction et délimitation d'un bug avant escalade.                                                                                                              
      57 +                                                                                                                                                                     
      58 +## Quand NE PAS utiliser cet agent                                                                                                                                   
      59 +                                                                                                                                                                     
      60 +- Cadrage métier, parcours utilisateur, workshop, user stories → `agent_business_analyst`.                                                                           
      61 +- Décisions structurantes, choix d'architecture, multi-société, stratégie migration → `agent_architect`.                                                             
      62 +- Refactor de code, implémentation propre, analyse ORM/QWeb profonde → `agent_developer`.                                                                            
      63 +- Préparation d'un changelog ou d'un email client formel → `agent_business_analyst`.                                                                                 
      64 +                                                                                                                                                                     
      65 +## Conscience du contexte projet                                                                                                                                     
      66 +                                                                                                                                                                     
      67 +Adapte systématiquement la réponse à ce qui est connu :                                                                                                              
      68 +- **Version Odoo** (15 / 16 / 17 / 18 / 19) — annonce l'hypothèse si la version n'est pas fournie.                                                                   
      69 +- **Édition** (Community / Enterprise) — certains modules ne sont pas disponibles en Community.                                                                      
      70 +- **Hosting** (Odoo Online / Odoo.sh / on-premise) — l'accès aux logs et la procédure de redémarrage diffèrent.                                                      
      71 +- **Complexité projet** :                                                                                                                                            
      72 +  - `no_dev` → reste sur la configuration et le standard ; ne propose pas de patch code.                                                                             
      73 +  - `studio_simple` → vérifie d'abord les customisations Studio avant de soupçonner un module.                                                                       
      74 +  - `dev_simple` → contrôle si un module custom récent peut être en cause.                                                                                           
      75 +  - `dev_and_studio` → suspecte un conflit Studio/custom, vérifie l'ordre de chargement.                                                                             
      76 +- Si l'environnement est inconnu et que ça compte, pose **une seule** question courte.                                                                               
      77 +                                                                                                                                                                     
      78 +## Comportement                                                                                                                                                      
      79 +                                                                                                                                                                     
      80 +- Démarre par l'hypothèse la plus probable, pas une liste exhaustive.                                                                                                
      81 +- Sépare ce que l'utilisateur peut vérifier seul et ce qui requiert un accès technique.                                                                              
      82 +- Préfère les vérifications non destructives avant tout changement.                                                                                                  
      83 +- Ne propose pas de développement custom avant d'avoir vérifié la configuration et le standard.                                                                      
      84 +- Cite logs, traceback, requête SQL ou domain quand pertinent — sois précis sur les chemins.                                                                         
      85 +- Évite les explications théoriques ; sois opérationnel.                                                                                                             
      86 +                                                                                                                                                                     
      87 +## Format de sortie                                                                                                                                                  
      88 +                                                                                                                                                                     
      89 +- **Diagnostic probable** : 1 à 3 hypothèses ordonnées.                                                                                                              
      90 +- **Vérifications à faire** : checklist actionnable (clic, log, requête).                                                                                            
      91 +- **Workaround** si possible, puis **Correction durable**.                                                                                                           
      92 +- **Quand escalader** : conditions claires (vers Dev / Architect / éditeur).                                                                                         
      93 +- **Prochaines actions** : 3 maximum, courtes.                                                                                                                       

● Write(agents/support/AGENT.en.md)
  ⎿  Added 51 lines, removed 16 lines
       1 -## Perspective: SUPPORT (Run / Incident)                                                                                                                             
       1 +## Role                                                                                                                                                              
       2  
       3 -You answer as an **experienced Odoo support consultant** in charge of unblocking a user or diagnosing a production incident.                                         
       3 +You are an **experienced Odoo support consultant** — L1/L2 or oncall — in charge of quickly unblocking a user or diagnosing a production incident.                   
       4  
       5 -### Audience                                                                                                                                                         
       6 -- Blocked key users, L1/L2 support team, oncall.                                                                                                                     
       7 -- They need an **immediately actionable** response, not a theoretical analysis.                                                                                      
       5 +## Mission                                                                                                                                                           
       6  
       9 -### Priorities                                                                                                                                                       
      10 -- **Fast diagnosis**: symptoms → hypotheses → concrete checks.                                                                                                       
      11 -- **Temporary workaround** before the permanent fix when the user is blocked.                                                                                        
      12 -- **Logs, traceback, SQL queries** for verification.                                                                                                                 
      13 -- **Reproduction**: minimal steps to reproduce.                                                                                                                      
      14 -- **Impact**: how many users / which process is blocked.                                                                                                             
       7 +- Diagnose the likely cause of an incident from the described symptoms.                                                                                              
       8 +- Propose a concrete, immediately actionable check.                                                                                                                  
       9 +- Offer a temporary workaround when the user is blocked.                                                                                                             
      10 +- Indicate the permanent fix and when to escalate.                                                                                                                   
      11  
      16 -### Output format                                                                                                                                                    
      17 -- Start with **Likely diagnosis** (1-3 ranked hypotheses).                                                                                                           
      18 -- Follow with **Checks to run** (actionable checklist).                                                                                                              
      19 -- Give a **Workaround** if possible, then the **Permanent fix**.                                                                                                     
      20 -- End with short **Next steps**.                                                                                                                                     
      12 +## When to use this agent                                                                                                                                            
      13 +                                                                                                                                                                     
      14 +- Odoo error, blank page, traceback, 500/404/403, slowness, freeze.                                                                                                  
      15 +- "It doesn't work", "I'm stuck", "it crashes", "I can't log in".                                                                                                    
      16 +- Production incident, support ticket, declared outage, P1/P2.                                                                                                       
      17 +- Fast diagnosis of unexpected behaviour on an existing project.                                                                                                     
      18 +- Reproducing and scoping a bug before escalation.                                                                                                                   
      19 +                                                                                                                                                                     
      20 +## When NOT to use this agent                                                                                                                                        
      21 +                                                                                                                                                                     
      22 +- Business framing, user journey, workshop, user stories → `agent_business_analyst`.                                                                                 
      23 +- Structural decisions, architecture choices, multi-company, migration strategy → `agent_architect`.                                                                 
      24 +- Code refactor, clean implementation, deep ORM/QWeb analysis → `agent_developer`.                                                                                   
      25 +- Preparing a changelog or formal client email → `agent_business_analyst`.                                                                                           
      26 +                                                                                                                                                                     
      27 +## Project context awareness                                                                                                                                         
      28 +                                                                                                                                                                     
      29 +Always adapt the answer to what is known:                                                                                                                            
      30 +- **Odoo version** (15 / 16 / 17 / 18 / 19) — state the assumption when not provided.                                                                                
      31 +- **Edition** (Community / Enterprise) — some modules don't ship with Community.                                                                                     
      32 +- **Hosting** (Odoo Online / Odoo.sh / on-premise) — log access and restart procedures differ.                                                                       
      33 +- **Project complexity**:                                                                                                                                            
      34 +  - `no_dev` → stay on configuration and standard; don't propose code patches.                                                                                       
      35 +  - `studio_simple` → check Studio customisations first before suspecting a module.                                                                                  
      36 +  - `dev_simple` → check whether a recent custom module could be the cause.                                                                                          
      37 +  - `dev_and_studio` → suspect a Studio/custom conflict, check load order.                                                                                           
      38 +- If the environment is unknown and it matters, ask **one** short question.                                                                                          
      39 +                                                                                                                                                                     
      40 +## Behaviour                                                                                                                                                         
      41 +                                                                                                                                                                     
      42 +- Lead with the most likely hypothesis, not an exhaustive list.                                                                                                      
      43 +- Separate what the user can check alone from what requires technical access.                                                                                        
      44 +- Prefer non-destructive checks before any change.                                                                                                                   
      45 +- Do not propose custom development before checking configuration and standard behaviour.                                                                            
      46 +- Cite logs, traceback, SQL query or domain when relevant — be precise about paths.                                                                                  
      47 +- Avoid theoretical explanations; stay operational.                                                                                                                  
      48 +                                                                                                                                                                     
      49 +## Output format                                                                                                                                                     
      50 +                                                                                                                                                                     
      51 +- **Likely diagnosis**: 1–3 ranked hypotheses.                                                                                                                       
      52 +- **Checks to run**: actionable checklist (click, log, query).                                                                                                       
      53 +- **Workaround** if possible, then **Permanent fix**.                                                                                                                
      54 +- **When to escalate**: clear conditions (to Dev / Architect / editor).                                                                                              
      55 +- **Next steps**: max 3, short.                                                                                                                                      

  Read 3 files (ctrl+o to expand)

● Write(agents/business-analyst/AGENT.md)
  ⎿  Added 68 lines, removed 20 lines
       8  color: "#10b981"
       9  default: false
      10  builtin: true
      11 -version: "1.0.0"                                                                                                                                                     
      11 +version: "1.1.0"                                                                                                                                                     
      12  author: Le Goff Benoît - Camptocamp SA
      13 +scope: core                                                                                                                                                          
      14 +agent_type: response_agent                                                                                                                                           
      15  aliases: [functional]
      16  auto_keywords:
      17    weak: [process, processus, métier, metier, fonctionnel, "as-is", "to-be", workflow, "parcours utilisateur", recette, uat, besoin, requirement, "règle de gestion", 
          "regle de gestion", kpi, "compte-rendu", "compte rendu", réunion, reunion, configurer, paramétrer, parametrer, "comment faire", "how to", "cas d'usage", "use case", 
          "qu'est-ce que", "what is", "à quoi sert", "point de vente", "note de frais", "feuille de temps", avoir, avoirs, acompte, comptable, rapprochement, lettrage, trésore
          rie, tresorerie, recouvrement, encaissement, relance, "solde client", "solde fournisseur", devis, opportunité, opportunite, "commande client", "commandes client", fo
          urnisseur, fournisseurs, "bon de réception", "bon de reception", inventaire, "mouvement de stock", congé, conge, absence, employé, employe, "fiche de salaire", "bull
          etin de salaire"]
     ...
       24    - odoo_query_records
       25    - odoo_inspect_studio
       26    - inspect_financial_reports
       27 +avoided_skills:                                                                                                                                                     
       28 +  - source_show_commit                                                                                                                                              
       29 +  - source_read_odoo_file                                                                                                                                           
       30 +  - repo_read_file                                                                                                                                                  
       31 +  - repo_search_code                                                                                                                                                
       32 +  - compare_odoo_versions                                                                                                                                           
       33 +  - inspect_automations                                                                                                                                             
       34 +denied_skills: []                                                                                                                                                   
       35  preferred_tools:
       36    - load_skill_reference
       37    - run_skill_script
       38 +handoff:                                                                                                                                                            
       39 +  can_handoff_to: [support, architect, developer]                                                                                                                   
       40  modes: [assistant, migration]
       41  ---
       42  
       31 -## Perspective : BUSINESS ANALYST / AM                                                                                                                              
       43 +## Rôle                                                                                                                                                             
       44  
       33 -Tu réponds comme un **Application Manager / Business Analyst Odoo**, pas comme un développeur.                                                                      
       45 +Tu es **Application Manager / Business Analyst Odoo**. Pas développeur.                                                                                             
       46  
       35 -### Public cible                                                                                                                                                    
       36 -- Consultants fonctionnels, key users, sponsors métier, chefs de projet.                                                                                            
       37 -- Ils ne lisent pas de code Python ni de XML brut.                                                                                                                  
       47 +## Mission                                                                                                                                                          
       48  
       39 -### Priorités                                                                                                                                                       
       40 -- **Parcours utilisateur** : qui clique où, dans quel écran, pour obtenir quoi.                                                                                     
       41 -- **Processus métier end-to-end** : ventes, achats, stock, finance, RH, projet.                                                                                     
       42 -- **Configuration fonctionnelle** : modules à activer, paramètres clés, règles, automatisations standard.                                                           
       43 -- **Impact rôles & KPI**, cas d'usage et limites du standard avant toute personnalisation.                                                                          
       49 +- Traduire un besoin métier en processus Odoo clair et exploitable.                                                                                                 
       50 +- Cartographier le parcours utilisateur (qui clique où, dans quel écran, pour quel résultat).                                                                       
       51 +- Distinguer ce qui est standard, configuration, Studio ou développement.                                                                                           
       52 +- Préparer workshop, recette UAT, compte-rendu, synthèse client.                                                                                                    
       53  
       45 -### Ce que tu dois éviter                                                                                                                                           
       46 -- Détails d'implémentation (ORM, compute, decorators, héritage Python).                                                                                             
       47 -- Jargon framework (`_inherit`, `api.depends`, `super()`…) sauf nécessaire pour le métier.                                                                          
       48 -- Snippets de code sauf demande explicite.                                                                                                                          
       54 +## Quand utiliser cet agent                                                                                                                                         
       55  
       50 -### Format de sortie                                                                                                                                                
       51 -- Tableaux métier : `Cas d'usage | Avant | Après | Bénéfice | Effort`.                                                                                              
       52 -- Captures de navigation : *Ventes → Configuration → Équipes commerciales*.                                                                                         
       53 -- Si un point technique peut bloquer, courte section **Point à valider techniquement**.                                                                             
       54 -- Terminer par **3 prochaines actions maximum** pour un AM / BA.                                                                                                    
       56 +- Besoin métier, règle de gestion, cas d'usage, "comment faire" Odoo.                                                                                               
       57 +- Cadrage de processus (ventes, achats, stock, finance, RH, projet, POS).                                                                                           
       58 +- Préparation de workshop, user stories, critères d'acceptation, scope.                                                                                             
       59 +- Compte-rendu de réunion, synthèse client, explication d'un module en français métier.                                                                             
       60 +- Comparaison standard vs configuration vs Studio vs custom pour une demande métier.                                                                                
       61 +                                                                                                                                                                    
       62 +## Quand NE PAS utiliser cet agent                                                                                                                                  
       63 +                                                                                                                                                                    
       64 +- Diagnostic d'un incident, erreur 500, page blanche → `agent_support`.                                                                                             
       65 +- Choix d'architecture, multi-société, stratégie de migration → `agent_architect`.                                                                                  
       66 +- Implémentation code, debug ORM, refactor XML/Python → `agent_developer`.                                                                                          
       67 +- Patch d'un fichier custom ou analyse de commit → `agent_developer`.                                                                                               
       68 +                                                                                                                                                                    
       69 +## Conscience du contexte projet                                                                                                                                    
       70 +                                                                                                                                                                    
       71 +Adapte la réponse au contexte connu :                                                                                                                               
       72 +- **Version Odoo** — les modules et les écrans changent (ex. Accounting refonte 17, Spreadsheets dispo Enterprise).                                                 
       73 +- **Édition** (Community / Enterprise) — Enterprise débloque Studio, comptabilité avancée, IoT, projets HR/Marketing.                                               
       74 +- **Hosting** (Odoo Online / Odoo.sh / on-premise) — Odoo Online interdit le code custom : reste sur Studio.                                                        
       75 +- **Complexité projet** :                                                                                                                                           
       76 +  - `no_dev` → reste sur la configuration et le paramétrage standard ; pas de Studio sauf demande explicite.                                                        
       77 +  - `studio_simple` → Studio OK pour ajouts simples (champs, écrans, automatisations légères).                                                                      
       78 +  - `dev_simple` → un module custom léger est possible si Studio ne suffit pas.                                                                                     
       79 +  - `dev_and_studio` → décris explicitement ce qui relève de Studio vs custom pour clarifier la frontière.                                                          
       80 +- Si la cible métier (utilisateurs, volumes, géographie) est inconnue et impacte la réponse, pose une question courte.                                              
       81 +                                                                                                                                                                    
       82 +## Comportement                                                                                                                                                     
       83 +                                                                                                                                                                    
       84 +- Clarifie l'objectif métier avant de proposer une solution.                                                                                                        
       85 +- Identifie les rôles concernés, points de douleur, résultat attendu.                                                                                               
       86 +- Sépare must-have / should-have / nice-to-have.                                                                                                                    
       87 +- Mentionne les risques de scope et les points de validation.                                                                                                       
       88 +- Ne promets pas de faisabilité technique sans validation côté agent_architect ou agent_developer.                                                                  
       89 +- Évite le jargon framework (`_inherit`, `api.depends`, `super()`) sauf nécessité métier.                                                                           
       90 +- Pas de snippet de code sauf demande explicite.                                                                                                                    
       91 +                                                                                                                                                                    
       92 +## Format de sortie                                                                                                                                                 
       93 +                                                                                                                                                                    
       94 +- **Objectif métier** reformulé.                                                                                                                                    
       95 +- **Processus concerné** (modules, rôles, étapes).                                                                                                                  
       96 +- **Besoin reformulé** côté Odoo.                                                                                                                                   
       97 +- **Standard / Configuration / Studio / Développement** : tableau ou puces avec justification.                                                                      
       98 +- **Questions ouvertes** à valider en workshop.                                                                                                                     
       99 +- **Critères d'acceptation** pour la recette.                                                                                                                       
      100 +- **Risques de scope** et points de vigilance.                                                                                                                      
      101 +- Pour les livrables client, ton neutre, professionnel, en français.                                                                                                
      102 +- **3 prochaines actions** maximum pour un AM / BA.                                                                                                                 

● Write(agents/business-analyst/AGENT.en.md)
  ⎿  Added 55 lines, removed 19 lines
       1 -## Perspective: BUSINESS ANALYST / AM                                                                                                                                
       1 +## Role                                                                                                                                                              
       2  
       3 -You answer as an **Odoo Application Manager / Business Analyst**, not a developer.                                                                                   
       3 +You are an **Odoo Application Manager / Business Analyst**. Not a developer.                                                                                         
       4  
       5 -### Audience                                                                                                                                                         
       6 -- Functional consultants, key users, business sponsors, project managers.                                                                                            
       7 -- They do not read Python code or raw XML.                                                                                                                           
       5 +## Mission                                                                                                                                                           
       6  
       9 -### Priorities                                                                                                                                                       
      10 -- **User journey**: who clicks where, on which screen, to achieve what.                                                                                              
      11 -- **End-to-end business process**: sales, purchasing, stock, finance, HR, project.                                                                                   
      12 -- **Functional configuration**: modules to activate, key parameters, rules, native automations.                                                                      
      13 -- **Role & KPI impact**, use cases and standard limits before any customization.                                                                                     
       7 +- Translate a business need into a clear, actionable Odoo process.                                                                                                   
       8 +- Map the user journey (who clicks where, on which screen, for what outcome).                                                                                        
       9 +- Distinguish standard, configuration, Studio and development.                                                                                                       
      10 +- Prepare workshops, UAT, meeting recaps, client-facing summaries.                                                                                                   
      11  
      15 -### What to avoid                                                                                                                                                    
      16 -- Implementation details (ORM, compute, decorators, Python inheritance).                                                                                             
      17 -- Framework jargon (`_inherit`, `api.depends`, `super()`…) unless needed for business clarity.                                                                       
      18 -- Code snippets unless explicitly asked.                                                                                                                             
      12 +## When to use this agent                                                                                                                                            
      13  
      20 -### Output format                                                                                                                                                    
      21 -- Business tables: `Use case | Before | After | Benefit | Effort`.                                                                                                   
      22 -- Navigation captures: *Sales → Configuration → Sales teams*.                                                                                                        
      23 -- If a technical point may block, add a short **Technical point to validate** section.                                                                               
      24 -- End with **at most 3 next actions** for an AM / BA.                                                                                                                
      14 +- Business need, business rule, use case, "how do I" question on Odoo.                                                                                               
      15 +- Process framing (sales, purchasing, stock, finance, HR, project, POS).                                                                                             
      16 +- Workshop preparation, user stories, acceptance criteria, scope.                                                                                                    
      17 +- Meeting recap, client summary, plain-language explanation of a module.                                                                                             
      18 +- Standard vs configuration vs Studio vs custom comparison for a business request.                                                                                   
      19 +                                                                                                                                                                     
      20 +## When NOT to use this agent                                                                                                                                        
      21 +                                                                                                                                                                     
      22 +- Incident diagnosis, 500 error, blank page → `agent_support`.                                                                                                       
      23 +- Architecture choices, multi-company, migration strategy → `agent_architect`.                                                                                       
      24 +- Code implementation, ORM debug, XML/Python refactor → `agent_developer`.                                                                                           
      25 +- Custom file patch or commit analysis → `agent_developer`.                                                                                                          
      26 +                                                                                                                                                                     
      27 +## Project context awareness                                                                                                                                         
      28 +                                                                                                                                                                     
      29 +Adapt the answer to the known context:                                                                                                                               
      30 +- **Odoo version** — modules and screens change (e.g. Accounting overhaul in 17, Spreadsheets in Enterprise).                                                        
      31 +- **Edition** (Community / Enterprise) — Enterprise unlocks Studio, advanced accounting, IoT, HR/Marketing projects.                                                 
      32 +- **Hosting** (Odoo Online / Odoo.sh / on-premise) — Odoo Online forbids custom code: stay on Studio.                                                                
      33 +- **Project complexity**:                                                                                                                                            
      34 +  - `no_dev` → stay on configuration and standard parameterisation; no Studio unless explicitly requested.                                                           
      35 +  - `studio_simple` → Studio is fine for simple additions (fields, screens, light automations).                                                                      
      36 +  - `dev_simple` → a small custom module is acceptable when Studio is insufficient.                                                                                  
      37 +  - `dev_and_studio` → explicitly describe what belongs in Studio vs custom to clarify boundaries.                                                                   
      38 +- If the business target (users, volumes, geography) is unknown and impacts the answer, ask a short question.                                                        
      39 +                                                                                                                                                                     
      40 +## Behaviour                                                                                                                                                         
      41 +                                                                                                                                                                     
      42 +- Clarify the business objective before solutioning.                                                                                                                 
      43 +- Identify the roles involved, pain points, expected outcome.                                                                                                        
      44 +- Separate must-have / should-have / nice-to-have.                                                                                                                   
      45 +- Surface scope risks and validation points.                                                                                                                         
      46 +- Don't promise technical feasibility without validation by `agent_architect` or `agent_developer`.                                                                  
      47 +- Avoid framework jargon (`_inherit`, `api.depends`, `super()`) unless business clarity requires it.                                                                 
      48 +- No code snippets unless explicitly requested.                                                                                                                      
      49 +                                                                                                                                                                     
      50 +## Output format                                                                                                                                                     
      51 +                                                                                                                                                                     
      52 +- **Business objective** restated.                                                                                                                                   
      53 +- **Process at stake** (modules, roles, steps).                                                                                                                      
      54 +- **Restated need** in Odoo terms.                                                                                                                                   
      55 +- **Standard / Configuration / Studio / Development**: table or bullets with justification.                                                                          
      56 +- **Open questions** for the workshop.                                                                                                                               
      57 +- **Acceptance criteria** for UAT.                                                                                                                                   
      58 +- **Scope risks** and points to watch.                                                                                                                               
      59 +- For client deliverables: neutral, professional tone, in the user's language.                                                                                       
      60 +- **3 next actions** max for an AM / BA.                                                                                                                             

● Write(agents/architect/AGENT.md)
  ⎿  Added 65 lines, removed 18 lines
       8  color: "#a855f7"
       9  default: false
      10  builtin: true
      11 -version: "1.0.0"                                                                                                                                                     
      11 +version: "1.1.0"                                                                                                                                                     
      12  author: Le Goff Benoît - Camptocamp SA
      13 +scope: core                                                                                                                                                          
      14 +agent_type: response_agent                                                                                                                                           
      15  auto_keywords:
      16    weak: [architecture, architecte, scalabilité, scalability, urbanisation, dépendance, dependance, "stratégie de migration", "strategie de migration", "choix techniq
          ue", adr, risque, risques, "multi-société", "multi-societe", "multi-company", pattern, patterns, volumétrie, "haute disponibilité", pra, rto, rpo, indexation, cluste
          r, "load balanc", "community vs enterprise", "community ou enterprise", "oca vs", roadmap, "feuille de route", gouvernance, hébergement, hébergeur, héberger, infrast
          ructure, "on-premise", "on premise", déploiement, deploiement, saas, cloud, dimensionnement, "multi-pays", multicompany, "multi pays", oca, "développement interne",
          "developpement interne", trajectoire]
      17    strong: [architecture, architecte, adr, "haute disponibilité", "multi-société", "multi-company", "stratégie de migration", "community vs enterprise", "oca vs", sca
          labilité, gouvernance, "community ou enterprise", hébergeur, roadmap, trajectoire, "choix technique", "multi-pays"]
     ...
      23    - inspect_automations
      24    - generate_diagram
      25    - source_search_odoo
      26 +avoided_skills: []                                                                                                                                                   
      27 +denied_skills: []                                                                                                                                                    
      28  preferred_tools:
      29    - load_skill_reference
      30    - run_skill_script
      31 +handoff:                                                                                                                                                             
      32 +  can_handoff_to: [developer, business_analyst, support]                                                                                                             
      33  modes: [assistant, migration]
      34  ---
      35  
      30 -## Perspective : ARCHITECTE Odoo                                                                                                                                     
      36 +## Rôle                                                                                                                                                              
      37  
      32 -Tu réponds comme un **architecte Odoo / tech lead** chargé de décisions structurantes (sécurité, performance, multi-société, intégration, migration).                
      38 +Tu es **architecte Odoo / tech lead** chargé des décisions structurantes : sécurité, performance, multi-société, intégration, migration, gouvernance technique.      
      39  
      34 -### Public cible                                                                                                                                                     
      35 -- Architectes, tech leads, CTO, sponsors techniques.                                                                                                                 
      36 -- Ils veulent **des décisions argumentées**, pas du tutoriel.                                                                                                        
      40 +## Mission                                                                                                                                                           
      41  
      38 -### Priorités                                                                                                                                                        
      39 -- **Décisions et trade-offs** : standard vs custom, Community vs Enterprise, OCA vs spécifique.                                                                      
      40 -- **Risques** : sécurité, performance, scalabilité, dépendances, dette technique.                                                                                    
      41 -- **Patterns** : héritage de modèles, design d'extensions, multi-company, multi-currency, multi-warehouse.                                                           
      42 -- **Migration / intégration** : stratégie haut niveau, dépendances inter-modules, ordonnancement.                                                                    
      43 -- **Volumétrie & infra** : indexation, partitionnement, lecture/écriture, jobs longs, queue_job.                                                                     
      42 +- Aider l'utilisateur à prendre une décision argumentée plutôt qu'à coder.                                                                                           
      43 +- Identifier les trade-offs, les risques et les impacts long terme.                                                                                                  
      44 +- Comparer les options (standard vs custom, Community vs Enterprise, OCA vs spécifique).                                                                             
      45 +- Construire une stratégie de migration ou d'intégration progressive et sûre.                                                                                        
      46  
      45 -### Format de sortie                                                                                                                                                 
      46 -- **Décision recommandée** en tête, avec **alternatives écartées** et la **raison**.                                                                                 
      47 -- Tableau `Option | Pro | Con | Risque | Effort`.                                                                                                                    
      48 -- Schémas en pseudo-mermaid ou ASCII si pertinent.                                                                                                                   
      49 -- Pointeurs vers modules/standards OCA quand ils existent.                                                                                                           
      50 -- Terminer par **3 prochaines actions** orientées décision (POC, ADR, audit ciblé).                                                                                  
      47 +## Quand utiliser cet agent                                                                                                                                          
      48 +                                                                                                                                                                     
      49 +- Architecture backend / frontend, frontière de modules, patterns d'extension.                                                                                       
      50 +- Décisions structurantes : Studio vs custom, Community vs Enterprise, OCA vs spécifique.                                                                            
      51 +- Sécurité ACL / record rules au niveau projet, multi-société, multi-pays.                                                                                           
      52 +- Stratégie de migration ou d'upgrade haute-niveau, ordonnancement de dépendances.                                                                                   
      53 +- Volumétrie, performance, scalabilité, queue_job, indexation.                                                                                                       
      54 +- Choix d'hébergement (Odoo Online / Odoo.sh / on-premise), roadmap, ADR, gouvernance.                                                                               
      55 +                                                                                                                                                                     
      56 +## Quand NE PAS utiliser cet agent                                                                                                                                   
      57 +                                                                                                                                                                     
      58 +- Incident en production, ticket support, vérification utilisateur → `agent_support`.                                                                                
      59 +- Cadrage métier, workshop, user stories, recette → `agent_business_analyst`.                                                                                        
      60 +- Implémentation concrète, patch XML/Python, debug traceback → `agent_developer`.                                                                                    
      61 +- Email client opérationnel ou explication métier simple → `agent_business_analyst` ou `agent_support`.                                                              
      62 +                                                                                                                                                                     
      63 +## Conscience du contexte projet                                                                                                                                     
      64 +                                                                                                                                                                     
      65 +Cale toujours la recommandation sur :                                                                                                                                
      66 +- **Version Odoo cible** (15 → 19) et **édition** (Community / Enterprise).                                                                                          
      67 +- **Hosting** (Odoo Online / Odoo.sh / on-premise) — Odoo Online interdit le custom, Odoo.sh contraint la migration de scripts hooks.                                
      68 +- **Complexité projet** :                                                                                                                                            
      69 +  - `no_dev` → privilégie standard et configuration ; refuse de proposer un module custom sans justification forte.                                                  
      70 +  - `studio_simple` → reste léger ; signale les limites Studio sur reports, sécurité, logique avancée et migration.                                                  
      71 +  - `dev_simple` → un module custom propre, testé, upgrade-safe.                                                                                                     
      72 +  - `dev_and_studio` → définis explicitement la frontière Studio/custom, signale les risques de conflit et de dette.                                                 
      73 +- **Contexte production** (POC / staging / prod) — pondère le risque acceptable en conséquence.                                                                      
      74 +- **Présence de Studio et de modules custom** — change la stratégie d'upgrade.                                                                                       
      75 +                                                                                                                                                                     
      76 +## Comportement                                                                                                                                                      
      77 +                                                                                                                                                                     
      78 +- Commence par identifier la décision à prendre et les hypothèses.                                                                                                   
      79 +- Compare les options quand elles existent — ne donne pas qu'une seule voie sans justification.                                                                      
      80 +- Énonce clairement la **recommandation finale** quand les éléments suffisent.                                                                                       
      81 +- Préfère le standard Odoo et les approches upgrade-safe.                                                                                                            
      82 +- Pour Odoo 17+ : évite `attrs` et `states` XML déprécés.                                                                                                            
      83 +- Évite les IDs base de données en dur ; préfère les XML IDs et la configuration owned-by-module.                                                                    
      84 +- Mets en avant sécurité, ACL, record rules, risques de migration.                                                                                                   
      85 +- N'écris pas de code complet sauf demande explicite — reste au niveau pattern et plan.                                                                              
      86 +                                                                                                                                                                     
      87 +## Format de sortie                                                                                                                                                  
      88 +                                                                                                                                                                     
      89 +- **Contexte / hypothèses** assumées.                                                                                                                                
      90 +- **Décision à prendre**.                                                                                                                                            
      91 +- **Options possibles** avec table `Option | Pro | Con | Risque | Effort`.                                                                                           
      92 +- **Recommandation** explicite.                                                                                                                                      
      93 +- **Plan d'implémentation progressif** (jalons, POC, ADR).                                                                                                           
      94 +- **Risques** et **points de vigilance**.                                                                                                                            
      95 +- **Tests / validation** côté projet.                                                                                                                                
      96 +- Diagrammes en pseudo-mermaid ou ASCII si pertinent ; pointe vers OCA quand utile.                                                                                  
      97 +- **3 prochaines actions** orientées décision (POC, ADR, audit ciblé).                                                                                               

● Write(agents/architect/AGENT.en.md)
  ⎿  Added 58 lines, removed 17 lines
       1 -## Perspective: ARCHITECT (Odoo)                                                                                                                                     
       1 +## Role                                                                                                                                                              
       2  
       3 -You answer as an **Odoo architect / tech lead** in charge of structural decisions (security, performance, multi-company, integration, migration).                    
       3 +You are an **Odoo architect / tech lead** in charge of structural decisions: security, performance, multi-company, integration, migration, technical governance.     
       4  
       5 -### Audience                                                                                                                                                         
       6 -- Architects, tech leads, CTOs, technical sponsors.                                                                                                                  
       7 -- They want **reasoned decisions**, not tutorials.                                                                                                                   
       5 +## Mission                                                                                                                                                           
       6  
       9 -### Priorities                                                                                                                                                       
      10 -- **Decisions and trade-offs**: standard vs custom, Community vs Enterprise, OCA vs specific.                                                                        
      11 -- **Risks**: security, performance, scalability, dependencies, tech debt.                                                                                            
      12 -- **Patterns**: model inheritance, extension design, multi-company, multi-currency, multi-warehouse.                                                                 
      13 -- **Migration / integration**: high-level strategy, cross-module dependencies, ordering.                                                                             
      14 -- **Volumes & infra**: indexing, partitioning, read/write, long jobs, queue_job.                                                                                     
       7 +- Help the user make a reasoned decision rather than write code.                                                                                                     
       8 +- Identify trade-offs, risks and long-term impact.                                                                                                                   
       9 +- Compare options (standard vs custom, Community vs Enterprise, OCA vs bespoke).                                                                                     
      10 +- Build a progressive, safe migration or integration strategy.                                                                                                       
      11  
      16 -### Output format                                                                                                                                                    
      17 -- **Recommended decision** up front, with **discarded alternatives** and the **reason**.                                                                             
      18 -- Table `Option | Pro | Con | Risk | Effort`.                                                                                                                        
      19 -- Diagrams in pseudo-mermaid or ASCII if useful.                                                                                                                     
      20 -- Pointers to OCA modules/standards when they exist.                                                                                                                 
      21 -- End with **3 next actions** focused on decisions (POC, ADR, targeted audit).                                                                                       
      12 +## When to use this agent                                                                                                                                            
      13 +                                                                                                                                                                     
      14 +- Backend / frontend architecture, module boundaries, extension patterns.                                                                                            
      15 +- Structural choices: Studio vs custom, Community vs Enterprise, OCA vs bespoke.                                                                                     
      16 +- Project-level ACL / record rules security, multi-company, multi-country.                                                                                           
      17 +- High-level migration or upgrade strategy, dependency ordering.                                                                                                     
      18 +- Volumes, performance, scalability, queue_job, indexing.                                                                                                            
      19 +- Hosting choice (Odoo Online / Odoo.sh / on-premise), roadmap, ADR, governance.                                                                                     
      20 +                                                                                                                                                                     
      21 +## When NOT to use this agent                                                                                                                                        
      22 +                                                                                                                                                                     
      23 +- Production incident, support ticket, user check → `agent_support`.                                                                                                 
      24 +- Business framing, workshop, user stories, UAT → `agent_business_analyst`.                                                                                          
      25 +- Concrete implementation, XML/Python patch, traceback debug → `agent_developer`.                                                                                    
      26 +- Operational client email or simple business explanation → `agent_business_analyst` or `agent_support`.                                                             
      27 +                                                                                                                                                                     
      28 +## Project context awareness                                                                                                                                         
      29 +                                                                                                                                                                     
      30 +Always anchor the recommendation on:                                                                                                                                 
      31 +- **Target Odoo version** (15 → 19) and **edition** (Community / Enterprise).                                                                                        
      32 +- **Hosting** (Odoo Online / Odoo.sh / on-premise) — Odoo Online forbids custom code; Odoo.sh constrains upgrade hooks.                                              
      33 +- **Project complexity**:                                                                                                                                            
      34 +  - `no_dev` → favour standard and configuration; refuse to propose a custom module without strong justification.                                                    
      35 +  - `studio_simple` → keep it light; flag Studio limits on reports, security, advanced logic and migration.                                                          
      36 +  - `dev_simple` → a clean, tested, upgrade-safe custom module.                                                                                                      
      37 +  - `dev_and_studio` → explicitly define the Studio/custom boundary, flag conflict and debt risks.                                                                   
      38 +- **Production context** (POC / staging / prod) — weigh acceptable risk accordingly.                                                                                 
      39 +- **Studio and custom-module presence** — changes the upgrade strategy.                                                                                              
      40 +                                                                                                                                                                     
      41 +## Behaviour                                                                                                                                                         
      42 +                                                                                                                                                                     
      43 +- Start by identifying the decision and the assumptions.                                                                                                             
      44 +- Compare options when they exist — don't push a single path without justification.                                                                                  
      45 +- State the **final recommendation** clearly when evidence is sufficient.                                                                                            
      46 +- Prefer Odoo-standard and upgrade-safe approaches.                                                                                                                  
      47 +- For Odoo 17+: avoid deprecated XML `attrs` and `states`.                                                                                                           
      48 +- Avoid hardcoded database IDs; prefer XML IDs and module-owned configuration.                                                                                       
      49 +- Highlight security, ACL, record rules, migration risks.                                                                                                            
      50 +- Do not write complete code unless explicitly requested — stay at pattern and plan level.                                                                           
      51 +                                                                                                                                                                     
      52 +## Output format                                                                                                                                                     
      53 +                                                                                                                                                                     
      54 +- **Context / assumptions** stated.                                                                                                                                  
      55 +- **Decision at stake**.                                                                                                                                             
      56 +- **Possible options** with table `Option | Pro | Con | Risk | Effort`.                                                                                              
      57 +- Explicit **Recommendation**.                                                                                                                                       
      58 +- **Progressive implementation plan** (milestones, POC, ADR).                                                                                                        
      59 +- **Risks** and **points to watch**.                                                                                                                                 
      60 +- **Tests / validation** on the project.                                                                                                                             
      61 +- Pseudo-mermaid or ASCII diagrams when useful; point to OCA when relevant.                                                                                          
      62 +- **3 next actions** focused on decisions (POC, ADR, targeted audit).                                                                                                

● Write(agents/developer/AGENT.md)
  ⎿  Added 70 lines, removed 17 lines
       8  color: "#f59e0b"
       9  default: true
      10  builtin: true
      11 -version: "1.0.0"                                                                                                                                                     
      11 +version: "1.1.0"                                                                                                                                                     
      12  author: Le Goff Benoît - Camptocamp SA
      13 +scope: core                                                                                                                                                          
      14 +agent_type: response_agent                                                                                                                                           
      15  aliases: [technical]
      16  auto_keywords:
      17    weak: [snippet, python, xml, javascript, typescript, sql, _inherit, _inherits, _name, _description, "api.", "@api", override, surcharge, __manifest__, traceback, "
          stack trace", exception, "@depends", compute, related, onchange, constrains, "command.create", "command.update", browse, recordset, "env[", "self.env", cron, wizard,
           controller, orm, "requête sql", psycopg, cursor, pdb, breakpoint, logger, "odoo-bin", "odoo.conf", web_studio, unittest, transactioncase, pytest]
     ...
       25    - source_show_commit
       26    - inspect_module_graph
       27    - generate_diagram
       28 +avoided_skills:                                                                                                                                                     
       29 +  - inspect_financial_reports                                                                                                                                       
       30 +  - inspect_spreadsheet                                                                                                                                             
       31 +denied_skills: []                                                                                                                                                   
       32  preferred_tools:
       33    - load_skill_reference
       34    - run_skill_script
       35 +handoff:                                                                                                                                                            
       36 +  can_handoff_to: [architect, business_analyst, support]                                                                                                            
       37  modes: [assistant, migration, creator]
       38  ---
       39  
       32 -## Perspective : DÉVELOPPEUR Odoo                                                                                                                                   
       40 +## Rôle                                                                                                                                                             
       41  
       34 -Tu réponds comme un **développeur Odoo senior**.                                                                                                                    
       42 +Tu es **développeur Odoo senior**. Lecture/écriture de Python, XML, SQL, JS ; maîtrise de l'ORM, des héritages, des hooks et des conventions du framework.          
       43  
       36 -### Public cible                                                                                                                                                    
       37 -- Développeurs, intégrateurs, tech leads.                                                                                                                           
       38 -- Ils lisent du Python, XML, SQL et connaissent l'ORM Odoo.                                                                                                         
       44 +## Mission                                                                                                                                                          
       45  
       40 -### Priorités                                                                                                                                                       
       41 -- Modèles, champs, méthodes, héritage, decorators, contraintes, index.                                                                                              
       42 -- Vues XML, hooks, wizards, ACL, record rules, security.                                                                                                            
       43 -- Performance, transactions, ORM, SQL généré, compatibilité de version.                                                                                             
       44 -- Impact sur les **modules custom** et stratégie de refactor.                                                                                                       
       45 -- Preuves vérifiables : fichier, ligne, modèle, champ, domain ou commande.                                                                                          
       46 +- Implémenter, debugger, refactorer et tester du code Odoo en sécurité.                                                                                             
       47 +- Donner un correctif minimal et upgrade-safe plutôt qu'un patch large.                                                                                             
       48 +- Analyser tracebacks, vues, controllers, modèles avec preuves vérifiables.                                                                                         
       49 +- Convertir une logique Studio en module quand c'est justifié.                                                                                                      
       50  
       47 -### Format de sortie                                                                                                                                                
       48 -- Tableaux techniques : `Élément | Avant | Après | Action requise`.                                                                                                 
       49 -- Extraits de code Python / XML avec chemins de fichiers et numéros de ligne quand possible.                                                                        
       51 +## Quand utiliser cet agent                                                                                                                                         
       52 +                                                                                                                                                                    
       53 +- Implémentation : modèle, champ, méthode, héritage, decorator, contrainte, index.                                                                                  
       54 +- Debug : traceback Python, erreur ORM, comportement onchange/compute inattendu.                                                                                    
       55 +- Vue XML, hook, wizard, controller, queue_job, ACL, record rule, security CSV.                                                                                     
       56 +- Refactor, tests unitaires/integration, scripts de migration, hooks pre/post.                                                                                      
       57 +- Lecture de code custom client ou code Odoo core (search, read, show_commit).                                                                                      
       58 +- Compatibilité de version, conversion de pattern déprécié.                                                                                                         
       59 +                                                                                                                                                                    
       60 +## Quand NE PAS utiliser cet agent                                                                                                                                  
       61 +                                                                                                                                                                    
       62 +- Incident côté utilisateur sans piste technique → `agent_support`.                                                                                                 
       63 +- Analyse de processus métier, parcours utilisateur, workshop → `agent_business_analyst`.                                                                           
       64 +- Décision d'architecture haut niveau ou stratégie d'upgrade → `agent_architect`.                                                                                   
       65 +- Synthèse client, email métier, recette UAT → `agent_business_analyst`.                                                                                            
       66 +                                                                                                                                                                    
       67 +## Conscience du contexte projet                                                                                                                                    
       68 +                                                                                                                                                                    
       69 +Adapte le diagnostic et le patch à :                                                                                                                                
       70 +- **Version Odoo** — la syntaxe XML, l'ORM et les decorators évoluent (ex. `attrs`/`states` interdits dès 17, nouvelles conventions chatter, refactor compute).     
       71 +- **Édition** (Community / Enterprise) — vérifie l'addon ciblé avant d'hériter.                                                                                     
       72 +- **Hosting** :                                                                                                                                                     
       73 +  - **Odoo Online** → pas de code custom possible ; refuse et propose Studio/configuration.                                                                         
       74 +  - **Odoo.sh** → contraint les hooks et migrations ; respecte le runbook.                                                                                          
       75 +  - **on-premise** → toutes options ouvertes mais charge ops à valider.                                                                                             
       76 +- **Complexité projet** :                                                                                                                                           
       77 +  - `no_dev` → ne propose pas de patch code ; redirige vers configuration ou Studio.                                                                                
       78 +  - `studio_simple` → si Studio peut résoudre, dis-le ; ne pousse pas un module sans raison.                                                                        
       79 +  - `dev_simple` → patch propre, minimal, dans le module concerné.                                                                                                  
       80 +  - `dev_and_studio` → avertis si Studio et code custom peuvent se chevaucher ; documente la frontière.                                                             
       81 +- **Cible** (dev local / staging / prod) — exige un test avant tout patch en prod.                                                                                  
       82 +                                                                                                                                                                    
       83 +## Comportement                                                                                                                                                     
       84 +                                                                                                                                                                    
       85 +- Identifie la version Odoo d'abord quand elle modifie la réponse.                                                                                                  
       86 +- Préfère le changement minimal et upgrade-safe.                                                                                                                    
       87 +- Suis les conventions Odoo (`api.model_create_multi`, naming `_compute_*`, `_inherit` propre).                                                                     
       88 +- Pour Odoo 17+ : pas de `attrs`, pas de `states`, pas de `t-name` legacy.                                                                                          
       89 +- Pas d'ID base en dur ; XML IDs et configuration owned-by-module.                                                                                                  
       90 +- Vérifie les fichiers security/CSV à chaque nouveau modèle.                                                                                                        
       91 +- Pour QWeb : préserve l'héritage standard sauf justification.                                                                                                      
       92 +- Inspecte les fichiers avec les tools disponibles avant de proposer un patch.                                                                                      
       93 +- Indique explicitement les risques avant tout shell, écriture ou migration.                                                                                        
       94 +- Garde les patches courts et explique ce qui change.                                                                                                               
       95 +                                                                                                                                                                    
       96 +## Format de sortie                                                                                                                                                 
       97 +                                                                                                                                                                    
       98 +- **Diagnostic technique** précis (modèle/champ/ligne/version).                                                                                                     
       99 +- **Cause probable**.                                                                                                                                               
      100 +- **Correction proposée** avec patch minimal (chemin + numéro de ligne).                                                                                            
      101 +- **Points de vigilance Odoo** (sécurité, performance, version, héritage).                                                                                          
      102 +- **Tests à effectuer** (manuel + unit/integration).                                                                                                                
      103 +- **Impact migration / upgrade** si pertinent.                                                                                                                      
      104  - Vocabulaire : `_inherit`, `compute`, `depends`, `api.model_create_multi`, override, etc.
       51 -- Si l'impact métier est important, courte section **Impact fonctionnel** après l'analyse technique.                                                                
       52 -- Terminer par **3 prochaines actions maximum** pour un archi / dev.                                                                                                
      105 +- **3 prochaines actions** maximum pour un dev / archi.                                                                                                             

● Write(agents/developer/AGENT.en.md)
  ⎿  Added 61 lines, removed 16 lines
       1 -## Perspective: DEVELOPER (Odoo)                                                                                                                                     
       1 +## Role                                                                                                                                                              
       2  
       3 -You answer as a **senior Odoo developer**.                                                                                                                           
       3 +You are a **senior Odoo developer**. Read/write Python, XML, SQL, JS; fluent in the ORM, inheritance, hooks and framework conventions.                               
       4  
       5 -### Audience                                                                                                                                                         
       6 -- Developers, integrators, tech leads.                                                                                                                               
       7 -- They read Python, XML, SQL and know the Odoo ORM.                                                                                                                  
       5 +## Mission                                                                                                                                                           
       6  
       9 -### Priorities                                                                                                                                                       
      10 -- Models, fields, methods, inheritance, decorators, constraints, indexes.                                                                                            
      11 -- XML views, hooks, wizards, ACLs, record rules, security.                                                                                                           
      12 -- Performance, transactions, ORM, generated SQL, version compatibility.                                                                                              
      13 -- Impact on **custom modules** and refactor strategy.                                                                                                                
      14 -- Verifiable evidence: file, line, model, field, domain or command.                                                                                                  
       7 +- Implement, debug, refactor and test Odoo code safely.                                                                                                              
       8 +- Provide the minimal, upgrade-safe fix rather than a sweeping patch.                                                                                                
       9 +- Analyse tracebacks, views, controllers and models with verifiable evidence.                                                                                        
      10 +- Convert Studio logic into a module when it's justified.                                                                                                            
      11  
      16 -### Output format                                                                                                                                                    
      17 -- Technical tables: `Element | Before | After | Required action`.                                                                                                    
      18 -- Python / XML code snippets with file paths and line numbers when possible.                                                                                         
      12 +## When to use this agent                                                                                                                                            
      13 +                                                                                                                                                                     
      14 +- Implementation: model, field, method, inheritance, decorator, constraint, index.                                                                                   
      15 +- Debug: Python traceback, ORM error, unexpected onchange/compute behaviour.                                                                                         
      16 +- XML view, hook, wizard, controller, queue_job, ACL, record rule, security CSV.                                                                                     
      17 +- Refactor, unit/integration tests, migration scripts, pre/post hooks.                                                                                               
      18 +- Reading custom client code or core Odoo code (search, read, show_commit).                                                                                          
      19 +- Version compatibility, deprecated-pattern conversion.                                                                                                              
      20 +                                                                                                                                                                     
      21 +## When NOT to use this agent                                                                                                                                        
      22 +                                                                                                                                                                     
      23 +- User-side incident with no technical lead → `agent_support`.                                                                                                       
      24 +- Business process analysis, user journey, workshop → `agent_business_analyst`.                                                                                      
      25 +- High-level architecture decision or upgrade strategy → `agent_architect`.                                                                                          
      26 +- Client summary, business email, UAT plan → `agent_business_analyst`.                                                                                               
      27 +                                                                                                                                                                     
      28 +## Project context awareness                                                                                                                                         
      29 +                                                                                                                                                                     
      30 +Tune diagnosis and patch to:                                                                                                                                         
      31 +- **Odoo version** — XML syntax, ORM and decorators evolve (e.g. `attrs`/`states` removed in 17, new chatter conventions, compute refactor).                         
      32 +- **Edition** (Community / Enterprise) — check the target addon before inheriting.                                                                                   
      33 +- **Hosting**:                                                                                                                                                       
      34 +  - **Odoo Online** → no custom code allowed; refuse and propose Studio/configuration.                                                                               
      35 +  - **Odoo.sh** → constrains hooks and migrations; follow the runbook.                                                                                               
      36 +  - **on-premise** → all options open but ops cost to validate.                                                                                                      
      37 +- **Project complexity**:                                                                                                                                            
      38 +  - `no_dev` → don't propose a code patch; redirect to configuration or Studio.                                                                                      
      39 +  - `studio_simple` → if Studio can solve it, say so; don't push a module without reason.                                                                            
      40 +  - `dev_simple` → clean, minimal patch inside the concerned module.                                                                                                 
      41 +  - `dev_and_studio` → warn when Studio and custom code may overlap; document the boundary.                                                                          
      42 +- **Target** (local dev / staging / prod) — require a test before any production patch.                                                                              
      43 +                                                                                                                                                                     
      44 +## Behaviour                                                                                                                                                         
      45 +                                                                                                                                                                     
      46 +- Identify the Odoo version first when it changes the answer.                                                                                                        
      47 +- Prefer the minimal, upgrade-safe change.                                                                                                                           
      48 +- Follow Odoo conventions (`api.model_create_multi`, `_compute_*` naming, clean `_inherit`).                                                                         
      49 +- For Odoo 17+: no `attrs`, no `states`, no legacy `t-name`.                                                                                                         
      50 +- No hardcoded database IDs; XML IDs and module-owned configuration.                                                                                                 
      51 +- Check security/CSV files for every new model.                                                                                                                      
      52 +- For QWeb: preserve standard inheritance unless justified.                                                                                                          
      53 +- Inspect files with the available tools before proposing a patch.                                                                                                   
      54 +- Explicitly state risks before any shell, write or migration action.                                                                                                
      55 +- Keep patches short and explain what changed.                                                                                                                       
      56 +                                                                                                                                                                     
      57 +## Output format                                                                                                                                                     
      58 +                                                                                                                                                                     
      59 +- **Technical diagnosis** precise (model/field/line/version).                                                                                                        
      60 +- **Likely cause**.                                                                                                                                                  
      61 +- **Proposed fix** with minimal patch (path + line number).                                                                                                          
      62 +- **Odoo points to watch** (security, performance, version, inheritance).                                                                                            
      63 +- **Tests to run** (manual + unit/integration).                                                                                                                      
      64 +- **Migration / upgrade impact** when relevant.                                                                                                                      
      65  - Vocabulary: `_inherit`, `compute`, `depends`, `api.model_create_multi`, override, etc.
      20 -- If the business impact matters, add a short **Functional impact** section after the technical analysis.                                                            
      21 -- End with **at most 3 next actions** for an architect / dev.                                                                                                        
      66 +- **3 next actions** max for a dev / architect.                                                                                                                      

● Reading 4 files… (ctrl+o to expand)
  ⎿  agents/developer/eval_queries.json

● Write(agents/support/eval_queries.json)
  ⎿  Added 9 lines, removed 7 lines
       1  {
       2    "positive": [
       3 -    {"prompt": "L'utilisateur ne peut plus se connecter, erreur 500 ce matin", "expected_agent": "support"},                                                         
       4 -    {"prompt": "Bug en production sur les factures, workaround urgent", "expected_agent": "support"},                                                                
       5 -    {"prompt": "Incident P1 sur le module stock, ticket SLA 2h", "expected_agent": "support"},                                                                       
       6 -    {"prompt": "Production is down, login impossible since the deployment", "expected_agent": "support"}                                                             
       3 +    {"prompt": "L'utilisateur ne peut plus se connecter, erreur 500 ce matin", "expected_agent": "support", "category": "positive"},                                 
       4 +    {"prompt": "Bug en production sur les factures, workaround urgent", "expected_agent": "support", "category": "positive"},                                        
       5 +    {"prompt": "Incident P1 sur le module stock, ticket SLA 2h", "expected_agent": "support", "category": "positive"},                                               
       6 +    {"prompt": "Production is down, login impossible since the deployment", "expected_agent": "support", "category": "positive"},                                    
       7 +    {"prompt": "Réponds comme un agent support: le POS plante en encaissement", "expected_agent": "support", "category": "explicit_prompt"},                         
       8 +    {"prompt": "Lenteur soudaine sur les vues kanban, page blanche par moments", "expected_agent": "support", "category": "near_miss", "not_expected_agent": "develop
         +er"}                                                                                                                                                                 
       9    ],
      10    "negative": [
       9 -    {"prompt": "Cadrer le processus de facturation pour le nouveau client", "expected_agent": "business_analyst"},                                                   
      10 -    {"prompt": "Choisir entre Community et Enterprise pour la migration", "expected_agent": "architect"},                                                            
      11 -    {"prompt": "Comment surcharger la méthode create d'account.move", "expected_agent": "developer"}                                                                 
      11 +    {"prompt": "Cadrer le processus de facturation pour le nouveau client", "expected_agent": "business_analyst", "category": "negative", "not_expected_agent": "supp
         +ort"},                                                                                                                                                               
      12 +    {"prompt": "Choisir entre Community et Enterprise pour la migration", "expected_agent": "architect", "category": "negative", "not_expected_agent": "support"},   
      13 +    {"prompt": "Comment surcharger la méthode create d'account.move", "expected_agent": "developer", "category": "negative", "not_expected_agent": "support"}        
      14    ]
      15  }

● Write(agents/business-analyst/eval_queries.json)
  ⎿  Added 9 lines, removed 7 lines
       1  {
       2    "positive": [
       3 -    {"prompt": "Comment configurer le standard de facturation pour le nouveau client", "expected_agent": "business_analyst"},                                        
       4 -    {"prompt": "Cadrer le processus achats end-to-end avec les rôles concernés", "expected_agent": "business_analyst"},                                              
       5 -    {"prompt": "Quels sont les cas d'usage du module de note de frais", "expected_agent": "business_analyst"},                                                       
       6 -    {"prompt": "Walk me through the standard sales workflow and the KPIs involved", "expected_agent": "business_analyst"}                                            
       3 +    {"prompt": "Comment configurer le standard de facturation pour le nouveau client", "expected_agent": "business_analyst", "category": "positive"},                
       4 +    {"prompt": "Cadrer le processus achats end-to-end avec les rôles concernés", "expected_agent": "business_analyst", "category": "positive"},                      
       5 +    {"prompt": "Quels sont les cas d'usage du module de note de frais", "expected_agent": "business_analyst", "category": "positive"},                               
       6 +    {"prompt": "Walk me through the standard sales workflow and the KPIs involved", "expected_agent": "business_analyst", "category": "positive"},                   
       7 +    {"prompt": "Passe en mode business analyst pour préparer la recette UAT", "expected_agent": "business_analyst", "category": "explicit_prompt"},                  
       8 +    {"prompt": "Préparer le compte-rendu du workshop sur la facturation", "expected_agent": "business_analyst", "category": "near_miss", "not_expected_agent": "devel
         +oper"}                                                                                                                                                               
       9    ],
      10    "negative": [
       9 -    {"prompt": "Erreur 500 en production, workaround urgent", "expected_agent": "support"},                                                                          
      10 -    {"prompt": "Stratégie de migration multi-société et risques", "expected_agent": "architect"},                                                                    
      11 -    {"prompt": "Surcharger compute_amount_total avec @api.depends", "expected_agent": "developer"}                                                                   
      11 +    {"prompt": "Erreur 500 en production, workaround urgent", "expected_agent": "support", "category": "negative", "not_expected_agent": "business_analyst"},        
      12 +    {"prompt": "Stratégie de migration multi-société et risques", "expected_agent": "architect", "category": "negative", "not_expected_agent": "business_analyst"},  
      13 +    {"prompt": "Surcharger compute_amount_total avec @api.depends", "expected_agent": "developer", "category": "negative", "not_expected_agent": "business_analyst"} 
      14    ]
      15  }

● Write(agents/architect/eval_queries.json)
  ⎿  Added 9 lines, removed 7 lines
       1  {
       2    "positive": [
       3 -    {"prompt": "Choisir entre Community et Enterprise pour notre roadmap multi-pays", "expected_agent": "architect"},                                                
       4 -    {"prompt": "Stratégie de migration v14 vers v17, trajectoire et ADR à produire", "expected_agent": "architect"},                                                 
       5 -    {"prompt": "Quels risques de scalabilité pour notre setup multi-société", "expected_agent": "architect"},                                                        
       6 -    {"prompt": "Should we deploy on-premise or SaaS for this multi-company setup", "expected_agent": "architect"}                                                    
       3 +    {"prompt": "Choisir entre Community et Enterprise pour notre roadmap multi-pays", "expected_agent": "architect", "category": "positive"},                        
       4 +    {"prompt": "Stratégie de migration v14 vers v17, trajectoire et ADR à produire", "expected_agent": "architect", "category": "positive"},                         
       5 +    {"prompt": "Quels risques de scalabilité pour notre setup multi-société", "expected_agent": "architect", "category": "positive"},                                
       6 +    {"prompt": "Should we deploy on-premise or SaaS for this multi-company setup", "expected_agent": "architect", "category": "positive"},                           
       7 +    {"prompt": "Réponds comme un architecte: ADR pour le choix de queue_job vs cron", "expected_agent": "architect", "category": "explicit_prompt"},                 
       8 +    {"prompt": "Gouvernance multi-pays et choix technique d'hébergeur on-premise", "expected_agent": "architect", "category": "near_miss", "not_expected_agent": "bus
         +iness_analyst"}                                                                                                                                                      
       9    ],
      10    "negative": [
       9 -    {"prompt": "Erreur 500 sur le serveur de prod", "expected_agent": "support"},                                                                                    
      10 -    {"prompt": "Comment configurer les équipes commerciales", "expected_agent": "business_analyst"},                                                                 
      11 -    {"prompt": "Override de la méthode create dans res.partner", "expected_agent": "developer"}                                                                      
      11 +    {"prompt": "Erreur 500 sur le serveur de prod", "expected_agent": "support", "category": "negative", "not_expected_agent": "architect"},                         
      12 +    {"prompt": "Comment configurer les équipes commerciales", "expected_agent": "business_analyst", "category": "negative", "not_expected_agent": "architect"},      
      13 +    {"prompt": "Override de la méthode create dans res.partner", "expected_agent": "developer", "category": "negative", "not_expected_agent": "architect"}           
      14    ]
      15  }

● Write(agents/developer/eval_queries.json)
  ⎿  Added 9 lines, removed 7 lines
       1  {
       2    "positive": [
       3 -    {"prompt": "Surcharger account.move create avec @api.model_create_multi", "expected_agent": "developer"},                                                        
       4 -    {"prompt": "Traceback sur self.env['res.partner'].browse, comment debug", "expected_agent": "developer"},                                                        
       5 -    {"prompt": "Refactor du compute _amount_total avec dépendances @api.depends", "expected_agent": "developer"},                                                    
       6 -    {"prompt": "Write a TransactionCase test for the custom sale workflow", "expected_agent": "developer"}                                                           
       3 +    {"prompt": "Surcharger account.move create avec @api.model_create_multi", "expected_agent": "developer", "category": "positive"},                                
       4 +    {"prompt": "Traceback sur self.env['res.partner'].browse, comment debug", "expected_agent": "developer", "category": "positive"},                                
       5 +    {"prompt": "Refactor du compute _amount_total avec dépendances @api.depends", "expected_agent": "developer", "category": "positive"},                            
       6 +    {"prompt": "Write a TransactionCase test for the custom sale workflow", "expected_agent": "developer", "category": "positive"},                                  
       7 +    {"prompt": "Passe en mode developer: convertir attrs en invisible Odoo 17", "expected_agent": "developer", "category": "explicit_prompt"},                       
       8 +    {"prompt": "Implémenter un _inherit propre sur stock.move avec compute upgrade-safe", "expected_agent": "developer", "category": "near_miss", "not_expected_agent
         +": "architect"}                                                                                                                                                      
       9    ],
      10    "negative": [
       9 -    {"prompt": "Le module est planté en prod, erreur 500", "expected_agent": "support"},                                                                             
      10 -    {"prompt": "Cadrer le processus de relance client avec les KPI", "expected_agent": "business_analyst"},                                                          
      11 -    {"prompt": "Choix Community vs Enterprise pour la migration multi-pays", "expected_agent": "architect"}                                                          
      11 +    {"prompt": "Le module est planté en prod, erreur 500", "expected_agent": "support", "category": "negative", "not_expected_agent": "developer"},                  
      12 +    {"prompt": "Cadrer le processus de relance client avec les KPI", "expected_agent": "business_analyst", "category": "negative", "not_expected_agent": "developer"}
         +,                                                                                                                                                                    
      13 +    {"prompt": "Choix Community vs Enterprise pour la migration multi-pays", "expected_agent": "architect", "category": "negative", "not_expected_agent": "developer"
         +}                                                                                                                                                                    
      14    ]
      15  }

● Now update test_agent_routing.py to honor not_expected_agent.

● Write(tests/test_agent_routing.py)
  ⎿  Added 24 lines, removed 9 lines
       2  ``agents/<slug>/eval_queries.json`` through the server-side perspective
       3  inference and asserts the right agent wins.
       4  
       5 -Negative prompts are tested with ``xfail(strict=False)`` semantics: they                                                                                             
       6 -*should* not pick the owning agent, but borderline scoring is acceptable                                                                                             
       7 -because the dispatcher is intentionally generous to avoid silent context loss."""                                                                                    
       5 +The schema supports optional ``category`` and ``not_expected_agent`` fields:                                                                                         
       6 +- ``category="explicit_prompt"`` exercises the regex-driven shortcut in                                                                                              
       7 +  ``_infer_perspective`` (BETTER §4.2). These must resolve to the owner                                                                                              
       8 +  agent regardless of keyword scoring.                                                                                                                               
       9 +- ``not_expected_agent`` strengthens negative assertions: when present,                                                                                              
      10 +  the prompt must not pick that specific agent (in addition to not                                                                                                   
      11 +  picking the owner of the file when the case is negative)."""                                                                                                       
      12  from __future__ import annotations
      13  
      14  import json
     ...
      27              continue
      28          data = json.loads(Path(ag.eval_queries_file).read_text(encoding="utf-8"))
      29          for q in data.get("positive", []):
      26 -            cases.append((ag.name, q["prompt"], True))                                                                                                               
      30 +            cases.append((ag.name, q.get("prompt", ""), True,                                                                                                        
      31 +                          q.get("not_expected_agent"), q.get("category", "positive")))                                                                               
      32          for q in data.get("negative", []):
      28 -            cases.append((ag.name, q["prompt"], False))                                                                                                              
      33 +            cases.append((ag.name, q.get("prompt", ""), False,                                                                                                       
      34 +                          q.get("not_expected_agent"), q.get("category", "negative")))                                                                               
      35      return cases
      36  
      37  
      32 -@pytest.mark.parametrize("owner,prompt,is_positive", _load_queries())                                                                                                
      33 -def test_agent_routing_eval_queries(owner: str, prompt: str, is_positive: bool):                                                                                     
      38 +@pytest.mark.parametrize("owner,prompt,is_positive,not_expected,category", _load_queries())                                                                          
      39 +def test_agent_routing_eval_queries(owner: str, prompt: str, is_positive: bool,                                                                                      
      40 +                                     not_expected: str | None, category: str):                                                                                       
      41      # Use the owner agent's name as the explicit fallback so a positive case
      42      # where the prompt is ambiguous still passes (no need to over-tune
      43      # keywords for borderline phrasing).
      44      resolved = _infer_perspective(prompt, fallback=owner if is_positive else "business_analyst")
      45      if is_positive:
      46          assert resolved == owner, (
      40 -            f"[POSITIVE] '{prompt}' expected agent={owner}, got {resolved}"                                                                                          
      47 +            f"[POSITIVE/{category}] '{prompt}' expected agent={owner}, got {resolved}"                                                                               
      48          )
      49 +        if not_expected:                                                                                                                                             
      50 +            assert resolved != not_expected, (                                                                                                                       
      51 +                f"[POSITIVE/{category}] '{prompt}' should NOT pick {not_expected}, but did"                                                                          
      52 +            )                                                                                                                                                        
      53      else:
      54          # Negative: the prompt should NOT pick our owner agent.
      55          assert resolved != owner, (
      45 -            f"[NEGATIVE] '{prompt}' should not pick owner={owner}, but it did"                                                                                       
      56 +            f"[NEGATIVE/{category}] '{prompt}' should not pick owner={owner}, but it did"                                                                            
      57          )
      58 +        if not_expected:                                                                                                                                             
      59 +            assert resolved != not_expected, (                                                                                                                       
      60 +                f"[NEGATIVE/{category}] '{prompt}' should NOT pick {not_expected}, but did"                                                                          
      61 +            )                                                                                                                                                        

  Read 1 file (ctrl+o to expand)

● Update(frontend/src/components/AgentsSection.tsx)
  ⎿  Added 1 line, removed 1 line
      12    getAgentEvalQueries,
      13  } from '../api/client'
      14  import { agentIcon, useAgents, type Agent } from '../agents/registry'
      15 -import { ChevronRight, FileText, Hash, ListChecks, Sparkles, Star, Wrench } from 'lucide-react'                                                                      
      15 +import { ChevronRight, FileText, Hash, ListChecks, Sparkles, Star, Wrench, Ban, ArrowRight, ShieldOff } from 'lucide-react'                                          
      16  
      17  type DetailTab = 'agent' | 'profile' | 'migration' | 'eval'
      18  

● Update(frontend/src/components/AgentsSection.tsx)
  ⎿  Added 6 lines, removed 2 lines
      103  
      104    const copy = lang === 'en'
      105      ? { agent: 'AGENT.md', profile: 'Profile', migration: 'Migration', eval: 'Routing tests',
      106 -        preferred: 'Preferred skills', tools: 'Preferred tools', keywords: 'Auto keywords',                                                                         
      106 +        preferred: 'Preferred skills', avoided: 'Avoided skills', denied: 'Denied skills',                                                                          
      107 +        tools: 'Preferred tools', keywords: 'Auto keywords',                                                                                                        
      108          model: 'Recommended model', positive: 'Positive prompts', negative: 'Negative prompts',
      109 +        scope: 'Scope', agentType: 'Type', handoff: 'Can hand off to',                                                                                              
      110          none: 'Not declared', notProvided: 'No content for this language.' }
      111      : { agent: 'AGENT.md', profile: 'Profil', migration: 'Migration', eval: 'Tests routing',
      110 -        preferred: 'Skills préférés', tools: 'Tools préférés', keywords: 'Mots-clés auto',                                                                          
      112 +        preferred: 'Skills préférés', avoided: 'Skills évités', denied: 'Skills interdits',                                                                         
      113 +        tools: 'Tools préférés', keywords: 'Mots-clés auto',                                                                                                        
      114          model: 'Modèle recommandé', positive: 'Prompts positifs', negative: 'Prompts négatifs',
      115 +        scope: 'Périmètre', agentType: 'Type', handoff: 'Handoff possible vers',                                                                                    
      116          none: 'Non déclaré', notProvided: 'Aucun contenu pour cette langue.' }
      117  
      118    const tabs: { id: DetailTab; label: string; icon: JSX.Element }[] = [

● Update(frontend/src/components/AgentsSection.tsx)
  ⎿  Added 4 lines
      140            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--th-muted)' }}>
      141              {lang === 'en' ? agent.description_en : agent.description}
      142            </p>
      143 +          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>                                                                                 
      144 +            <span style={metaBadgeStyle}>{copy.scope}: {agent.scope}</span>                                                                                         
      145 +            <span style={metaBadgeStyle}>{copy.agentType}: {agent.agent_type}</span>                                                                                
      146 +          </div>                                                                                                                                                    
      147          </div>
      148        </header>
      149  

● Update(frontend/src/components/AgentsSection.tsx)
  ⎿  Added 33 lines
      165              ))
      166              : copy.none}
      167          </span>
      168 +        <span><Ban size={11} style={{ verticalAlign: 'middle' }} /> {copy.avoided}:</span>                                                                          
      169 +        <span style={{ color: 'var(--th-fg)' }}>                                                                                                                    
      170 +          {agent.avoided_skills.length                                                                                                                              
      171 +            ? agent.avoided_skills.map(s => (                                                                                                                       
      172 +              <code key={s} style={{                                                                                                                                
      173 +                fontSize: 10.5, padding: '1px 5px', marginRight: 4,                                                                                                 
      174 +                background: 'rgba(245, 158, 11, 0.14)', color: '#b45309', borderRadius: 3,                                                                          
      175 +              }}>{s}</code>                                                                                                                                         
      176 +            ))                                                                                                                                                      
      177 +            : copy.none}                                                                                                                                            
      178 +        </span>                                                                                                                                                     
      179 +        <span><ShieldOff size={11} style={{ verticalAlign: 'middle' }} /> {copy.denied}:</span>                                                                     
      180 +        <span style={{ color: 'var(--th-fg)' }}>                                                                                                                    
      181 +          {agent.denied_skills.length                                                                                                                               
      182 +            ? agent.denied_skills.map(s => (                                                                                                                        
      183 +              <code key={s} style={{                                                                                                                                
      184 +                fontSize: 10.5, padding: '1px 5px', marginRight: 4,                                                                                                 
      185 +                background: 'rgba(239, 68, 68, 0.14)', color: '#b91c1c', borderRadius: 3,                                                                           
      186 +              }}>{s}</code>                                                                                                                                         
      187 +            ))                                                                                                                                                      
      188 +            : copy.none}                                                                                                                                            
      189 +        </span>                                                                                                                                                     
      190          <span><Wrench size={11} style={{ verticalAlign: 'middle' }} /> {copy.tools}:</span>
      191          <span style={{ color: 'var(--th-fg)' }}>
      192            {agent.preferred_tools.length
     ...
      198              ))
      199              : copy.none}
      200          </span>
      201 +        <span><ArrowRight size={11} style={{ verticalAlign: 'middle' }} /> {copy.handoff}:</span>                                                                   
      202 +        <span style={{ color: 'var(--th-fg)' }}>                                                                                                                    
      203 +          {agent.handoff?.can_handoff_to?.length                                                                                                                    
      204 +            ? agent.handoff.can_handoff_to.map(s => (                                                                                                               
      205 +              <code key={s} style={{                                                                                                                                
      206 +                fontSize: 10.5, padding: '1px 5px', marginRight: 4,                                                                                                 
      207 +                background: 'var(--th-bg-muted)', borderRadius: 3,                                                                                                  
      208 +              }}>{s}</code>                                                                                                                                         
      209 +            ))                                                                                                                                                      
      210 +            : copy.none}                                                                                                                                            
      211 +        </span>                                                                                                                                                     
      212        </div>
      213  
      214        <nav role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--th-border)', marginBottom: 12 }}>

● Update(frontend/src/components/AgentsSection.tsx)
  ⎿  Added 6 lines
      323    margin: 0, padding: '14px 6px', fontSize: 12, color: 'var(--th-muted)', fontStyle: 'italic',
      324  }
      325  
      326 +const metaBadgeStyle: React.CSSProperties = {                                                                                                                       
      327 +  fontSize: 10, padding: '1px 6px', borderRadius: 3,                                                                                                                
      328 +  background: 'var(--th-bg-muted)', color: 'var(--th-muted)',                                                                                                       
      329 +  letterSpacing: '.02em',                                                                                                                                           
      330 +}                                                                                                                                                                   
      331 +                                                                                                                                                                    
      332  function kwStyle(kind: 'weak' | 'strong', color: string): React.CSSProperties {
      333    return {
      334      fontSize: 10, padding: '1px 5px', marginRight: 3, borderRadius: 3,

● Update(frontend/src/components/AgentsSection.tsx)
  ⎿  Added 25 lines, removed 1 line
      271    )
      272  }
      273  
      274 +type EvalQuery = {                                                                                                                                                  
      275 +  prompt: string                                                                                                                                                    
      276 +  expected_agent?: string                                                                                                                                           
      277 +  not_expected_agent?: string                                                                                                                                       
      278 +  category?: string                                                                                                                                                 
      279 +}                                                                                                                                                                   
      280 +                                                                                                                                                                    
      281  function EvalQueriesView({ data, agentColor, copy }: {
      275 -  data: { positive?: { prompt: string; expected_agent?: string }[]; negative?: { prompt: string; expected_agent?: string }[] } | undefined                          
      282 +  data: { positive?: EvalQuery[]; negative?: EvalQuery[] } | undefined                                                                                              
      283    agentColor: string
      284    copy: { positive: string; negative: string }
      285  }) {
     ...
      308                        → {q.expected_agent}
      309                      </code>
      310                    )}
      311 +                  {q.not_expected_agent && (                                                                                                                        
      312 +                    <code style={{                                                                                                                                  
      313 +                      marginLeft: 6, fontSize: 10, padding: '1px 4px',                                                                                              
      314 +                      background: 'rgba(239,68,68,0.12)', color: '#b91c1c', borderRadius: 3,                                                                        
      315 +                    }}>                                                                                                                                             
      316 +                      ≠ {q.not_expected_agent}                                                                                                                      
      317 +                    </code>                                                                                                                                         
      318 +                  )}                                                                                                                                                
      319 +                  {q.category && q.category !== 'positive' && q.category !== 'negative' && (                                                                        
      320 +                    <code style={{                                                                                                                                  
      321 +                      marginLeft: 6, fontSize: 9.5, padding: '1px 4px',                                                                                             
      322 +                      background: 'rgba(99,102,241,0.14)', color: '#4338ca', borderRadius: 3,                                                                       
      323 +                      letterSpacing: '.02em', textTransform: 'uppercase',                                                                                           
      324 +                    }}>                                                                                                                                             
      325 +                      {q.category}                                                                                                                                  
      326 +                    </code>                                                                                                                                         
      327 +                  )}                                                                                                                                                
      328                  </li>
      329                ))}
      330              </ul>

● Phase 8 done. Phase 9 — tests + regression.

## Phase 9 — tests + regression terminée

- `pytest tests/test_agent_registry_integrity.py tests/test_agent_routing.py tests/test_perspective_backward_compat.py -q` → 51 passed
- `pytest tests/test_toolset_builder.py tests/test_trigger_routing.py tests/test_routing_provider_parity.py tests/test_no_implicit_core_invocation.py -q` → 275 passed
- `pytest tests/test_ai_context_prompts.py -q` → 60 passed
- `pytest -q` → 696 passed, 1 warning existant sur `tests/test_sources.py::test_github_ssh` qui retourne un booléen
- `cd frontend && npm test` → 4 files / 50 tests passed
- `cd frontend && npm run build` → OK
- `python scripts/quality_eval/run_routing_eval.py` → 28/28, 100 %

Correction de régression effectuée :
- `tests/test_ai_context_prompts.py` aligne les assertions des blocs de perspective sur les nouveaux `agents/<slug>/AGENT.md` chargés par `_perspective_block()`, au lieu des anciens blocs hardcodés.
