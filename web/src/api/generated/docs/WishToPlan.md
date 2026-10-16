
# WishToPlan

Wish-to-Plan conversion request with an optional atomic schedule.  Without an explicit title the Plan inherits the Wish title. Supplying ``schedule`` makes the new Plan date-only or timed without a second lifecycle request; omitting it preserves the existing unscheduled flow.

## Properties

Name | Type
------------ | -------------
`description` | string
`placeId` | string
`schedule` | [PlanSchedule](PlanSchedule.md)
`title` | string

## Example

```typescript
import type { WishToPlan } from ''

// TODO: Update the object below with actual values
const example = {
  "description": null,
  "placeId": null,
  "schedule": null,
  "title": null,
} satisfies WishToPlan

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishToPlan
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


