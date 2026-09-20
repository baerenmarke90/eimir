
# ServerAdminAccountSummary


## Properties

Name | Type
------------ | -------------
`activeMembershipCount` | number
`activeSessionCount` | number
`authMethods` | Array&lt;string&gt;
`createdAt` | Date
`deletionStatus` | [AccountDeletionStatus](AccountDeletionStatus.md)
`disabledAt` | Date
`displayName` | string
`emailVerified` | boolean
`id` | string
`primaryEmail` | string

## Example

```typescript
import type { ServerAdminAccountSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "activeMembershipCount": null,
  "activeSessionCount": null,
  "authMethods": null,
  "createdAt": null,
  "deletionStatus": null,
  "disabledAt": null,
  "displayName": null,
  "emailVerified": null,
  "id": null,
  "primaryEmail": null,
} satisfies ServerAdminAccountSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminAccountSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


