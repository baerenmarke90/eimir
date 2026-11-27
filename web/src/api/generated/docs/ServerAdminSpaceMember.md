
# ServerAdminSpaceMember

A member Account at email level; never a display name.

## Properties

Name | Type
------------ | -------------
`accountId` | string
`authMethods` | Array&lt;string&gt;
`emailVerified` | boolean
`endedAt` | Date
`membershipStatus` | string
`primaryEmail` | string
`since` | Date

## Example

```typescript
import type { ServerAdminSpaceMember } from ''

// TODO: Update the object below with actual values
const example = {
  "accountId": null,
  "authMethods": null,
  "emailVerified": null,
  "endedAt": null,
  "membershipStatus": null,
  "primaryEmail": null,
  "since": null,
} satisfies ServerAdminSpaceMember

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminSpaceMember
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


