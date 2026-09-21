
# DailyCheckInOwnView

Only the caller\'s current-day state; partner row metadata is never exposed.

## Properties

Name | Type
------------ | -------------
`energyLevel` | number
`version` | number
`vibe` | [DailyVibe](DailyVibe.md)

## Example

```typescript
import type { DailyCheckInOwnView } from ''

// TODO: Update the object below with actual values
const example = {
  "energyLevel": null,
  "version": null,
  "vibe": null,
} satisfies DailyCheckInOwnView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DailyCheckInOwnView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


