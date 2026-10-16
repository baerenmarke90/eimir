
# PlanSchedule

One explicit Plan schedule representation.  ``plannedOn`` is a calendar day. ``plannedStart`` is a timezone-aware instant. Exactly one of those semantic starts must be supplied; clients may never synthesize a wall-clock time merely to encode ``plannedOn``.

## Properties

Name | Type
------------ | -------------
`plannedEnd` | Date
`plannedOn` | Date
`plannedStart` | Date

## Example

```typescript
import type { PlanSchedule } from ''

// TODO: Update the object below with actual values
const example = {
  "plannedEnd": null,
  "plannedOn": null,
  "plannedStart": null,
} satisfies PlanSchedule

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanSchedule
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


