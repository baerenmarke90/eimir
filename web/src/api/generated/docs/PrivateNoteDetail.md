
# PrivateNoteDetail


## Properties

Name | Type
------------ | -------------
`body` | string
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`id` | string
`ownerId` | string
`pinned` | boolean
`spaceId` | string
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { PrivateNoteDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "body": null,
  "capabilities": null,
  "createdAt": null,
  "id": null,
  "ownerId": null,
  "pinned": null,
  "spaceId": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies PrivateNoteDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PrivateNoteDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


