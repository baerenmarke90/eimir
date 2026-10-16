
# ActivityItem


## Properties

Name | Type
------------ | -------------
`actor` | [AuthorSummary](AuthorSummary.md)
`actorId` | string
`createdAt` | Date
`id` | string
`kind` | [ActivityKind](ActivityKind.md)
`occurredAt` | Date
`sourceEventId` | string
`target` | [ActivityTargetPresentation](ActivityTargetPresentation.md)
`targetId` | string
`targetType` | [EngagementTarget](EngagementTarget.md)

## Example

```typescript
import type { ActivityItem } from ''

// TODO: Update the object below with actual values
const example = {
  "actor": null,
  "actorId": null,
  "createdAt": null,
  "id": null,
  "kind": null,
  "occurredAt": null,
  "sourceEventId": null,
  "target": null,
  "targetId": null,
  "targetType": null,
} satisfies ActivityItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ActivityItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


