
# ServerAdminAccountDeletionResult


## Properties

Name | Type
------------ | -------------
`acceptedAt` | Date
`accountId` | string
`status` | [AccountDeletionStatus](AccountDeletionStatus.md)

## Example

```typescript
import type { ServerAdminAccountDeletionResult } from ''

// TODO: Update the object below with actual values
const example = {
  "acceptedAt": null,
  "accountId": null,
  "status": null,
} satisfies ServerAdminAccountDeletionResult

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminAccountDeletionResult
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


