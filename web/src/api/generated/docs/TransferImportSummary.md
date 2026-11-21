
# TransferImportSummary


## Properties

Name | Type
------------ | -------------
`mediaCount` | number
`recordCounts` | { [key: string]: number; }
`scope` | [TransferScope](TransferScope.md)
`skippedVideoCount` | number
`sourceMemberCount` | number
`videoBytes` | number
`videoCount` | number
`videosNeedPro` | boolean

## Example

```typescript
import type { TransferImportSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "mediaCount": null,
  "recordCounts": null,
  "scope": null,
  "skippedVideoCount": null,
  "sourceMemberCount": null,
  "videoBytes": null,
  "videoCount": null,
  "videosNeedPro": null,
} satisfies TransferImportSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TransferImportSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


