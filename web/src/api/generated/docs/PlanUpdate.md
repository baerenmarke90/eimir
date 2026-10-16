
# PlanUpdate

Domain correction without changing lifecycle status.  Schedule fields remain owned by ``/schedule`` and ``/unschedule``. ``experiencedOn`` is the one exception: it may be corrected on a completed Plan without reopening it (M3-D04).

## Properties

Name | Type
------------ | -------------
`description` | string
`experiencedOn` | Date
`placeId` | string
`title` | string

## Example

```typescript
import type { PlanUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "description": null,
  "experiencedOn": null,
  "placeId": null,
  "title": null,
} satisfies PlanUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


