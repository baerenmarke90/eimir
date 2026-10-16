
# TransferImportDetail


## Properties

Name | Type
------------ | -------------
`artifactSize` | number
`completedAt` | Date
`createdAt` | Date
`errorCode` | string
`expiresAt` | Date
`id` | string
`scope` | [TransferScope](TransferScope.md)
`status` | [ImportStatus](ImportStatus.md)
`summary` | [TransferImportSummary](TransferImportSummary.md)
`validatedAt` | Date

## Example

```typescript
import type { TransferImportDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "artifactSize": null,
  "completedAt": null,
  "createdAt": null,
  "errorCode": null,
  "expiresAt": null,
  "id": null,
  "scope": null,
  "status": null,
  "summary": null,
  "validatedAt": null,
} satisfies TransferImportDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TransferImportDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


