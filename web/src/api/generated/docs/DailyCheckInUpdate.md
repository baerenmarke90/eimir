
# DailyCheckInUpdate

Partial owner mutation for dimensions whose product values are decided.  Vibe is intentionally absent: #429 has not yet frozen the product enum, so accepting a string here would turn an implementation guess into API state.

## Properties

Name | Type
------------ | -------------
`energyLevel` | number

## Example

```typescript
import type { DailyCheckInUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "energyLevel": null,
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


