
# SpacePersonalSettingsPatch

Only the changed keys; ``null`` removes a saved choice.

## Properties

Name | Type
------------ | -------------
`occasionHolidays` | boolean
`wirStatistics` | boolean

## Example

```typescript
import type { SpacePersonalSettingsPatch } from ''

// TODO: Update the object below with actual values
const example = {
  "occasionHolidays": null,
  "wirStatistics": null,
} satisfies SpacePersonalSettingsPatch

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SpacePersonalSettingsPatch
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


