
# PlanCreate

Direct Plan creation with an optional atomic schedule.  Lifecycle state remains server-owned. Omitting ``schedule`` creates an ``IDEA``; supplying a valid date-only or timed schedule creates a ``PLANNED`` Plan in the same transaction.

## Properties

Name | Type
------------ | -------------
`description` | string
`placeId` | string
`schedule` | [PlanSchedule](PlanSchedule.md)
`title` | string

## Example

```typescript
import type { PlanCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "description": null,
  "placeId": null,
  "schedule": null,
  "title": null,
} satisfies PlanCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


