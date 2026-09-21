
# DailyQuotePreferencePatch


## Properties

Name | Type
------------ | -------------
`enabled` | boolean
`locale` | string
`selectedCategoryIds` | Array&lt;string&gt;
`selectedSourceIds` | Array&lt;string&gt;

## Example

```typescript
import type { DailyQuotePreferencePatch } from ''

// TODO: Update the object below with actual values
const example = {
  "enabled": null,
  "locale": null,
  "selectedCategoryIds": null,
  "selectedSourceIds": null,
} satisfies DailyQuotePreferencePatch

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DailyQuotePreferencePatch
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


