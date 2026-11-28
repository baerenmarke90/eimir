
# SupportReportListView


## Properties

Name | Type
------------ | -------------
`hasMore` | boolean
`items` | [Array&lt;SupportReportListItem&gt;](SupportReportListItem.md)
`newCount` | number
`nextCursor` | string
`stateCounts` | [SupportReportStateCounts](SupportReportStateCounts.md)

## Example

```typescript
import type { SupportReportListView } from ''

// TODO: Update the object below with actual values
const example = {
  "hasMore": null,
  "items": null,
  "newCount": null,
  "nextCursor": null,
  "stateCounts": null,
} satisfies SupportReportListView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportListView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


