
# ServerAdminSpaceSummary


## Properties

Name | Type
------------ | -------------
`activeMembershipCount` | number
`anomalyCodes` | Array&lt;string&gt;
`createdAt` | Date
`firstMembershipAt` | Date
`historicalMembershipCount` | number
`id` | string
`lastMembershipChangeAt` | Date
`leftMembershipCount` | number
`lifecycleStatus` | string
`membershipCount` | number
`removedMembershipCount` | number

## Example

```typescript
import type { ServerAdminSpaceSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "activeMembershipCount": null,
  "anomalyCodes": null,
  "createdAt": null,
  "firstMembershipAt": null,
  "historicalMembershipCount": null,
  "id": null,
  "lastMembershipChangeAt": null,
  "leftMembershipCount": null,
  "lifecycleStatus": null,
  "membershipCount": null,
  "removedMembershipCount": null,
} satisfies ServerAdminSpaceSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminSpaceSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


