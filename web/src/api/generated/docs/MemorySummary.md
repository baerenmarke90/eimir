
# MemorySummary

Memory projection used as a timeline card.  Ordinary Memory bodies remain on the detail route. Guided experiences include their bounded authored responses so one shared card can present both partners without a per-card detail request.

## Properties

Name | Type
------------ | -------------
`attachments` | [Array&lt;MemoryAttachmentSummary&gt;](MemoryAttachmentSummary.md)
`author` | [AuthorSummary](AuthorSummary.md)
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`experienceAnswers` | [Array&lt;ExperienceAnswer&gt;](ExperienceAnswer.md)
`experienceKind` | [ExperienceKind](ExperienceKind.md)
`happenedOn` | Date
`happenedUntil` | Date
`id` | string
`selectedCoverAttachmentId` | string
`title` | string

## Example

```typescript
import type { MemorySummary } from ''

// TODO: Update the object below with actual values
const example = {
  "attachments": null,
  "author": null,
  "capabilities": null,
  "createdAt": null,
  "experienceAnswers": null,
  "experienceKind": null,
  "happenedOn": null,
  "happenedUntil": null,
  "id": null,
  "selectedCoverAttachmentId": null,
  "title": null,
} satisfies MemorySummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MemorySummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


