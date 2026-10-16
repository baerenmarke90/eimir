
# ServerAdminAccountDetail


## Properties

Name | Type
------------ | -------------
`activeMembershipCount` | number
`activeSessionCount` | number
`authMethods` | Array&lt;string&gt;
`createdAt` | Date
`deletionAcceptedAt` | Date
`deletionStatus` | [AccountDeletionStatus](AccountDeletionStatus.md)
`disabledAt` | Date
`displayName` | string
`emailVerified` | boolean
`emails` | [Array&lt;ServerAdminAccountEmail&gt;](ServerAdminAccountEmail.md)
`historicalMembershipCount` | number
`id` | string
`lastSessionActivityAt` | Date
`localPasswordAvailable` | boolean
`mailRecoveryAvailable` | boolean
`passkeyCount` | number
`primaryEmail` | string

## Example

```typescript
import type { ServerAdminAccountDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "activeMembershipCount": null,
  "activeSessionCount": null,
  "authMethods": null,
  "createdAt": null,
  "deletionAcceptedAt": null,
  "deletionStatus": null,
  "disabledAt": null,
  "displayName": null,
  "emailVerified": null,
  "emails": null,
  "historicalMembershipCount": null,
  "id": null,
  "lastSessionActivityAt": null,
  "localPasswordAvailable": null,
  "mailRecoveryAvailable": null,
  "passkeyCount": null,
  "primaryEmail": null,
} satisfies ServerAdminAccountDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminAccountDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


