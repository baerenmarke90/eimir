
# DailyQuoteView


## Properties

Name | Type
------------ | -------------
`attributionRequired` | boolean
`authorDisplay` | string
`categoryIds` | Array&lt;string&gt;
`id` | string
`locale` | string
`rightsClassification` | [RightsClassification](RightsClassification.md)
`sourceDisplay` | string
`sourceId` | string
`text` | string

## Example

```typescript
import type { DailyQuoteView } from ''

// TODO: Update the object below with actual values
const example = {
  "attributionRequired": null,
  "authorDisplay": null,
  "categoryIds": null,
  "id": null,
  "locale": null,
  "rightsClassification": null,
  "sourceDisplay": null,
  "sourceId": null,
  "text": null,
} satisfies DailyQuoteView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DailyQuoteView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


