
# AccountPersonalSettingsPatch

Only the changed keys; ``null`` removes a saved choice.

## Properties

Name | Type
------------ | -------------
`diaryLayout` | [DiaryLayout](DiaryLayout.md)
`gardenSound` | boolean
`gardenVibration` | boolean
`theme` | [ThemePreference](ThemePreference.md)

## Example

```typescript
import type { AccountPersonalSettingsPatch } from ''

// TODO: Update the object below with actual values
const example = {
  "diaryLayout": null,
  "gardenSound": null,
  "gardenVibration": null,
  "theme": null,
} satisfies AccountPersonalSettingsPatch

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AccountPersonalSettingsPatch
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


