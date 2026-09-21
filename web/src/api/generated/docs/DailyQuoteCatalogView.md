
# DailyQuoteCatalogView


## Properties

Name | Type
------------ | -------------
`categories` | [Array&lt;QuoteCategoryView&gt;](QuoteCategoryView.md)
`sources` | [Array&lt;QuoteSourceView&gt;](QuoteSourceView.md)

## Example

```typescript
import type { DailyQuoteCatalogView } from ''

// TODO: Update the object below with actual values
const example = {
  "categories": null,
  "sources": null,
} satisfies DailyQuoteCatalogView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DailyQuoteCatalogView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


