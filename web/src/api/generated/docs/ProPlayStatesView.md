
# ProPlayStatesView

Spaces by their deciding Google Play grant.

## Properties

Name | Type
------------ | -------------
`active` | number
`cancelledRunning` | number
`ended30d` | number
`paymentProblem` | number

## Example

```typescript
import type { ProPlayStatesView } from ''

// TODO: Update the object below with actual values
const example = {
  "active": null,
  "cancelledRunning": null,
  "ended30d": null,
  "paymentProblem": null,
} satisfies ProPlayStatesView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ProPlayStatesView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


