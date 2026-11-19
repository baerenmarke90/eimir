
# MediaGalleryPage


## Properties

Name | Type
------------ | -------------
`hasMore` | boolean
`items` | [Array&lt;MediaGalleryItem&gt;](MediaGalleryItem.md)
`nextCursor` | string
`totalCount` | number

## Example

```typescript
import type { MediaGalleryPage } from ''

// TODO: Update the object below with actual values
const example = {
  "hasMore": null,
  "items": null,
  "nextCursor": null,
  "totalCount": null,
} satisfies MediaGalleryPage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MediaGalleryPage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


