
# ServerAdminJobItem

Queue metadata safe for ServerAdmin responses.  Deliberately absent: payload, last_error, locked_by, and payload-derived IDs.

## Properties

Name | Type
------------ | -------------
`attempts` | number
`createdAt` | Date
`delayed` | boolean
`exhausted` | boolean
`finishedAt` | Date
`id` | string
`kind` | string
`maxAttempts` | number
`pendingAgeSeconds` | number
`runAfter` | Date
`status` | string

## Example

```typescript
import type { ServerAdminJobItem } from ''

// TODO: Update the object below with actual values
const example = {
  "attempts": null,
  "createdAt": null,
  "delayed": null,
  "exhausted": null,
  "finishedAt": null,
  "id": null,
  "kind": null,
  "maxAttempts": null,
  "pendingAgeSeconds": null,
  "runAfter": null,
  "status": null,
} satisfies ServerAdminJobItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminJobItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


