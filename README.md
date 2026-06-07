# AI Bottleneck Map

`ai-bottleneck-map` is an Agent Skill for turning broad AI and semiconductor narratives into bottleneck maps, company node cards, and re-rating paths.

It is inspired by the useful research behavior behind supply-chain hunters: start from a technology expansion path, drill into the constrained layer, map listed companies carefully, and keep timing plus falsification explicit.

This repository does not try to mimic any person's voice. It packages a reusable research method for:

- AI infrastructure
- semiconductors
- CPO and optical interconnect
- HBM and packaging
- power and cooling
- robotics
- defense-electronics-adjacent supply chains

## What it does

Instead of stopping at a stock list, the skill pushes the workflow through:

`theme -> system change -> bottleneck layer -> public company mapping -> timing -> trigger -> kill conditions`

It is meant for:

- theme scans
- company challenge work
- AI industry-chain knowledge bases
- node-card generation
- re-rating map building

## Repository layout

```text
ai-bottleneck-map-skill/
├── SKILL.md
├── LICENSE
├── agents/
│   └── openai.yaml
├── references/
│   ├── workflow.md
│   ├── node-card-schema.md
│   └── source-checklist.md
└── assets/
    ├── node-card-template.md
    └── prompt-pack.md
```

## Highlights

- Compact `SKILL.md` focused on trigger logic and workflow.
- Detailed references split out for progressive loading.
- Explicit distinction between research value and investability.
- Built-in node-card schema for knowledge-base ingestion.
- Emphasis on timing windows, re-rating triggers, and falsification.

## Example prompts

```text
Use ai-bottleneck-map to break down CPO into bottleneck layers first, then rank the cleanest listed company mappings with evidence, timing, triggers, and kill conditions.
```

```text
Use ai-bottleneck-map to challenge this company. Tell me whether it truly controls a scarce layer or only benefits from the theme.
```

```text
Use ai-bottleneck-map in knowledge-base mode and output structured node cards for my AI supply-chain map.
```

## Scope

This is research support only. It helps structure evidence and ranking logic. Trading decisions stay with the user.
