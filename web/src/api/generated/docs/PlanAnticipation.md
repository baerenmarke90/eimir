
# PlanAnticipation

Whether a Plan may carry the countdown on Wir (#504, #2158 D).  ``AUTOMATIC`` lets the countdown show the Plan when it is the next upcoming one and no Plan is pinned. ``ALWAYS`` pins it: a pinned upcoming Plan wins over every automatic one. ``NEVER`` keeps the Plan off the countdown.

## Properties

Name | Type
------------ | -------------

## Example

```typescript
import type { PlanAnticipation } from ''

// TODO: Update the object below with actual values
const example = {
} satisfies PlanAnticipation

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanAnticipation
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


