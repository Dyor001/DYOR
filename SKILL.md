---
name: ai-bottleneck-map
description: Build AI industry bottleneck maps and company node cards from themes, supply-chain clues, and public evidence. Use this skill when the user asks to research AI infrastructure, semiconductors, CPO, HBM, packaging, power, cooling, robotics, defense electronics, or adjacent themes with phrases like "用 Serenity 的方式看", "产业链瓶颈", "卡点地图", "供应链寻宝", "哪个公司最接近瓶颈", "做知识库节点卡", "重估路线图", or "challenge this thesis". The skill turns broad narratives into bottleneck layers, company mappings, timing windows, re-rating triggers, analogs, and falsification conditions. Research support only; the user keeps the trading decision.
metadata:
  short-description: AI supply-chain bottleneck mapper
---

# AI Bottleneck Map

Use this skill to turn a theme into a structured bottleneck map rather than a loose stock list.

The core question is:

`Which layer becomes hard to scale first, which companies map cleanly to that layer, and what evidence would prove or break the thesis?`

## Default behavior

When the request is about a theme, company, or research direction, work from:

`theme -> system change -> bottleneck layer -> listed mapping -> timing -> trigger -> kill conditions`

Do not stop at "this sector is hot" or "this stock may benefit". Push down to the specific constrained layer and back up to the best public-market mapping.

For broad scans, rank layers before companies.

For company questions, separate:

- research value;
- investability;
- evidence quality;
- timing quality.

## Output contract

Default to these deliverables unless the user asks for a lighter answer:

1. A short judgment on the best layer or layers to study first.
2. A bottleneck map with 3-6 layers or nodes.
3. Company node cards for the best candidates.
4. A short list of triggers, timing windows, and kill conditions.

When building company cards, use the schema in `references/node-card-schema.md`.

When the user is building a knowledge base, prefer structured fields over prose.

## Workflow

1. Set the scope.
   - Market, theme, time window, and whether the user wants idea generation, validation, ranking, or knowledge-base entries.

2. Translate the narrative into a physical or operational constraint.
   - Look for bandwidth, yield, heat, power, latency, purity, qualification time, testing throughput, packaging density, reliability, or geopolitics.

3. Map the chain.
   - Demand side, systems, modules, chips, packaging, testing, materials, infrastructure, and overlooked enabling layers.

4. Find the bottleneck layer.
   - Prefer low supplier count, long customer qualification, hard scale-up, specialized tools, material purity, or capacity reservation dynamics.

5. Map listed companies to the layer.
   - Separate direct controllers from indirect beneficiaries and story stocks.
   - If the mapping is weak, say so clearly.

6. Add time and re-rating logic.
   - Mark the stage: concept, sample, qualification, pilot, low-volume, ramp, mass production, expansion.
   - State what could force the market to re-rate the name.

7. Add falsification.
   - Say what would downgrade or kill the thesis.

## Research standards

Use public evidence whenever possible.

Prefer:

- filings and annual or quarterly reports;
- earnings calls and investor presentations;
- exchange announcements;
- customer or supplier confirmation;
- project filings, policy documents, bids, or environmental approvals;
- patents, standards, and technical conference materials.

Treat social posts as lead generation, not proof.

If current facts matter and live tools are unavailable, state exactly what needs verification.

Read `references/source-checklist.md` when you need stronger proof paths.

## What makes this different

This skill is not trying to imitate anyone's voice. It only absorbs the useful method:

- start from a major technology expansion path;
- drill into the narrow layer;
- test whether the listed company is a clean mapping;
- keep timing and falsification explicit;
- store the output as reusable node cards.

## Communication style

Be direct and plain.

- Lead with the best layer, not the longest background.
- Distinguish "interesting clue" from "credible mapping".
- Distinguish "credible mapping" from "good risk-reward".
- Use concrete phrases such as "卡住的环节", "量产窗口", "重估触发", and "杀逻辑条件".

Avoid hype language and avoid pretending the evidence is stronger than it is.

## Bundled references

Load only what is needed:

- `references/workflow.md` for the detailed research flow and ranking logic.
- `references/node-card-schema.md` for the structured company card schema.
- `references/source-checklist.md` for evidence paths and verification prompts.
- `assets/node-card-template.md` for reusable output formatting.
- `assets/prompt-pack.md` for reusable prompts.
