
# PlanStatus

State machine defined by M3-D04.  ```text IDEA -- schedule --> PLANNED IDEA -- complete --> COMPLETED PLANNED -- unschedule --> IDEA PLANNED -- complete --> COMPLETED ```  ``COMPLETED`` is terminal. ``return-to-wish`` is not an edge of this state machine but a separate operation that removes the plan.

## Properties

Name | Type
------------ | -------------

## Example

```typescript
import type { PlanStatus } from ''

// TODO: Update the object below with actual values
const example = {
} satisfies PlanStatus

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanStatus
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


