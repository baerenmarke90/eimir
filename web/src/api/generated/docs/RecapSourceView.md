
# RecapSourceView


## Properties

Name | Type
------------ | -------------
`available` | boolean
`excerpt` | string
`id` | string
`key` | string
`kind` | [RecapSourceKind](RecapSourceKind.md)
`mutualReaction` | string
`occurredOn` | Date
`previewAttachmentId` | string
`previewIsSensitive` | boolean
`quote` | [RecapQuoteView](RecapQuoteView.md)
`title` | string
`version` | number

## Example

```typescript
import type { RecapSourceView } from ''

// TODO: Update the object below with actual values
const example = {
  "available": null,
  "excerpt": null,
  "id": null,
  "key": null,
  "kind": null,
  "mutualReaction": null,
  "occurredOn": null,
  "previewAttachmentId": null,
  "previewIsSensitive": null,
  "quote": null,
  "title": null,
  "version": null,
} satisfies RecapSourceView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RecapSourceView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


