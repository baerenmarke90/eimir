
# AccountPersonalSettingsView

The caller\'s Account-wide choices; ``null`` means no saved choice.

## Properties

Name | Type
------------ | -------------
`diaryLayout` | [DiaryLayout](DiaryLayout.md)
`gardenSound` | boolean
`gardenVibration` | boolean
`schemaVersion` | number
`theme` | [ThemePreference](ThemePreference.md)
`version` | number

## Example

```typescript
import type { AccountPersonalSettingsView } from ''

// TODO: Update the object below with actual values
const example = {
  "diaryLayout": null,
  "gardenSound": null,
  "gardenVibration": null,
  "schemaVersion": null,
  "theme": null,
  "version": null,
} satisfies AccountPersonalSettingsView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AccountPersonalSettingsView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


