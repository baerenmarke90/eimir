
# ServerAdminPrivilegedAuditItem


## Properties

Name | Type
------------ | -------------
`action` | string
`actorId` | string
`category` | string
`createdAt` | Date
`effectCount` | number
`id` | string
`newValue` | boolean
`previousValue` | boolean
`targetAccountId` | string
`targetSpaceId` | string

## Example

```typescript
import type { ServerAdminPrivilegedAuditItem } from ''

// TODO: Update the object below with actual values
const example = {
  "action": null,
  "actorId": null,
  "category": null,
  "createdAt": null,
  "effectCount": null,
  "id": null,
  "newValue": null,
  "previousValue": null,
  "targetAccountId": null,
  "targetSpaceId": null,
} satisfies ServerAdminPrivilegedAuditItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminPrivilegedAuditItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


