# Node Card Schema

Use this schema when converting research into reusable knowledge-base entries.

## Required fields

- `theme`
- `bottleneck_layer`
- `company`
- `market`
- `role`
  - anchor
  - elasticity
  - edge
  - observation
- `chain_position`
- `mapping_strength`
  - strong
  - medium
  - weak
- `stage`
- `time_window`
- `re_rating_triggers`
- `evidence`
- `kill_conditions`

## Recommended fields

- `ticker`
- `country`
- `customers`
- `competitors`
- `analog`
- `upstream_dependencies`
- `downstream_dependency`
- `valuation_notes`
- `open_questions`

## Compact template

```md
### {company} ({ticker})

- Theme:
- Bottleneck layer:
- Role:
- Chain position:
- Mapping strength:
- Stage:
- Time window:
- Re-rating triggers:
- Evidence:
- Kill conditions:
- Analog:
- Open questions:
```

## Usage notes

- `anchor` means higher certainty and broader confirmation.
- `elasticity` means stronger upside if the chain thesis lands.
- `edge` means a lower-consensus or less obvious mapping.
- `observation` means a real clue, but not yet a clean investable mapping.

Do not promote a company above `observation` if evidence is mostly social or inferential.
