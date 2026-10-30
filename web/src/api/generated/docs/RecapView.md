
# RecapView


## Properties

Name | Type
------------ | -------------
`generatedAt` | Date
`headline` | string
`id` | string
`introduction` | string
`isPartial` | boolean
`kind` | [RecapKind](RecapKind.md)
`locale` | string
`month` | number
`ownDraft` | [RecapDraftView](RecapDraftView.md)
`reflections` | [Array&lt;RecapReflectionView&gt;](RecapReflectionView.md)
`savedAt` | Date
`sources` | [Array&lt;RecapSourceView&gt;](RecapSourceView.md)
`startsOn` | Date
`status` | string
`theme` | string
`throughOn` | Date
`variant` | number
`version` | number
`year` | number

## Example

```typescript
import type { RecapView } from ''

// TODO: Update the object below with actual values
const example = {
  "generatedAt": null,
  "headline": null,
  "id": null,
  "introduction": null,
  "isPartial": null,
  "kind": null,
  "locale": null,
  "month": null,
  "ownDraft": null,
  "reflections": null,
  "savedAt": null,
  "sources": null,
  "startsOn": null,
  "status": null,
  "theme": null,
  "throughOn": null,
  "variant": null,
  "version": null,
  "year": null,
} satisfies RecapView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RecapView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


