
# TransferExportDetail


## Properties

Name | Type
------------ | -------------
`artifactSize` | number
`createdAt` | Date
`downloadUrl` | string
`errorCode` | string
`expiresAt` | Date
`id` | string
`readyAt` | Date
`scope` | [TransferScope](TransferScope.md)
`status` | [ExportStatus](ExportStatus.md)

## Example

```typescript
import type { TransferExportDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "artifactSize": null,
  "createdAt": null,
  "downloadUrl": null,
  "errorCode": null,
  "expiresAt": null,
  "id": null,
  "readyAt": null,
  "scope": null,
  "status": null,
} satisfies TransferExportDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TransferExportDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


