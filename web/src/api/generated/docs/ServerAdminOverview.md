
# ServerAdminOverview

Privacy-safe operational projection for one eimir. installation.

## Properties

Name | Type
------------ | -------------
`accountCount` | number
`accountsLast24h` | number
`accountsLast30d` | number
`accountsLast7d` | number
`activeSessionCount` | number
`activeSpaceCount` | number
`applicationStatus` | string
`buildRevision` | string
`databaseProvider` | string
`databaseStatus` | string
`demoMode` | boolean
`deployment` | string
`enabledAccountCount` | number
`environment` | string
`jobsFailed` | number
`jobsPending` | number
`jobsRunning` | number
`lastSuccessfulJobAt` | Date
`localPasswordAccountCount` | number
`mailTransport` | string
`mediaObjectCount` | number
`mediaStatus` | string
`mediaStore` | string
`mediaStoredBytes` | number
`oidcAccountCount` | number
`oidcConnectionCount` | number
`oldestPendingJobAt` | Date
`passkeyAccountCount` | number
`processStartedAt` | Date
`publicBaseUrl` | string
`recentFailedJobs` | [Array&lt;ServerAdminFailedJob&gt;](ServerAdminFailedJob.md)
`serverAdminAllowlistCount` | number
`serverAdminVerifiedMatchCount` | number
`suspendedAccountCount` | number
`unverifiedPrimaryEmailCount` | number
`verifiedPrimaryEmailCount` | number
`warningCodes` | Array&lt;string&gt;
`workerStatus` | string

## Example

```typescript
import type { ServerAdminOverview } from ''

// TODO: Update the object below with actual values
const example = {
  "accountCount": null,
  "accountsLast24h": null,
  "accountsLast30d": null,
  "accountsLast7d": null,
  "activeSessionCount": null,
  "activeSpaceCount": null,
  "applicationStatus": null,
  "buildRevision": null,
  "databaseProvider": null,
  "databaseStatus": null,
  "demoMode": null,
  "deployment": null,
  "enabledAccountCount": null,
  "environment": null,
  "jobsFailed": null,
  "jobsPending": null,
  "jobsRunning": null,
  "lastSuccessfulJobAt": null,
  "localPasswordAccountCount": null,
  "mailTransport": null,
  "mediaObjectCount": null,
  "mediaStatus": null,
  "mediaStore": null,
  "mediaStoredBytes": null,
  "oidcAccountCount": null,
  "oidcConnectionCount": null,
  "oldestPendingJobAt": null,
  "passkeyAccountCount": null,
  "processStartedAt": null,
  "publicBaseUrl": null,
  "recentFailedJobs": null,
  "serverAdminAllowlistCount": null,
  "serverAdminVerifiedMatchCount": null,
  "suspendedAccountCount": null,
  "unverifiedPrimaryEmailCount": null,
  "verifiedPrimaryEmailCount": null,
  "warningCodes": null,
  "workerStatus": null,
} satisfies ServerAdminOverview

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminOverview
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


