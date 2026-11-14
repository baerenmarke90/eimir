
# WishPlanReference

The Plan that originated from this Wish (``Plan.sourceWishId``).  Read-only journey context for presentation (#1790 F2). It carries only what a Wish surface needs to point to the Plan and show when it happens; the Plan itself stays the source of truth. ``plannedOn`` is a date-only schedule and ``plannedStart`` an exact instant; at most one is set, and both are null for a Plan without a date. ``experiencedOn`` is set once the Plan was completed.

## Properties

Name | Type
------------ | -------------
`experiencedOn` | Date
`id` | string
`plannedOn` | Date
`plannedStart` | Date
`status` | [PlanStatus](PlanStatus.md)

## Example

```typescript
import type { WishPlanReference } from ''

// TODO: Update the object below with actual values
const example = {
  "experiencedOn": null,
  "id": null,
  "plannedOn": null,
  "plannedStart": null,
  "status": null,
} satisfies WishPlanReference

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishPlanReference
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


