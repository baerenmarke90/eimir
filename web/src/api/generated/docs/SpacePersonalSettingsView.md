
# SpacePersonalSettingsView

The caller\'s own choices in one Space; ``null`` means no saved choice.

## Properties

Name | Type
------------ | -------------
`occasionHolidays` | boolean
`schemaVersion` | number
`version` | number
`wirStatistics` | boolean

## Example

```typescript
import type { SpacePersonalSettingsView } from ''

// TODO: Update the object below with actual values
const example = {
  "occasionHolidays": null,
  "schemaVersion": null,
  "version": null,
  "wirStatistics": null,
} satisfies SpacePersonalSettingsView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SpacePersonalSettingsView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


