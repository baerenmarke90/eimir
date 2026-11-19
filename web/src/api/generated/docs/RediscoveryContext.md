
# RediscoveryContext

Viewer-safe facts a rediscovery card may phrase as a varying line.

## Properties

Name | Type
------------ | -------------
`chapterTitle` | string
`excerpt` | string
`excerptTruncated` | boolean
`partOfDay` | [PartOfDay](PartOfDay.md)
`photoCount` | number
`placeName` | string
`tag` | string
`videoCount` | number

## Example

```typescript
import type { RediscoveryContext } from ''

// TODO: Update the object below with actual values
const example = {
  "chapterTitle": null,
  "excerpt": null,
  "excerptTruncated": null,
  "partOfDay": null,
  "photoCount": null,
  "placeName": null,
  "tag": null,
  "videoCount": null,
} satisfies RediscoveryContext

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RediscoveryContext
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


