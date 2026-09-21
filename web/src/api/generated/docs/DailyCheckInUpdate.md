
# DailyCheckInUpdate

Partial owner mutation for the shared current-day dimensions.

## Properties

Name | Type
------------ | -------------
`energyLevel` | number
`vibe` | [DailyVibe](DailyVibe.md)

## Example

```typescript
import type { DailyCheckInUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "energyLevel": null,
  "vibe": null,
} satisfies DailyCheckInUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DailyCheckInUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


