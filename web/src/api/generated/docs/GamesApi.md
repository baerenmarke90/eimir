# GamesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getGameMomentCandidates**](GamesApi.md#getgamemomentcandidates) | **GET** /api/v1/spaces/{spaceId}/games/moments/candidates | Get Game Moment Candidates |
| [**getGameWishCandidates**](GamesApi.md#getgamewishcandidates) | **GET** /api/v1/spaces/{spaceId}/games/wishes/candidates | Get Game Wish Candidates |



## getGameMomentCandidates

> GameMemoryCandidateSet getGameMomentCandidates(spaceId)

Get Game Moment Candidates

Return Premium-authorized shared photo Memories for the first #863 grammar.  Normal authentication and Space membership are resolved before this route receives &#x60;authorization&#x60;. Commercial entitlement is then enforced on the server. The actual content query remains constrained by the existing &#x60;readable()&#x60; authorization predicate and existing attachment bindings.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGameMomentCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGameMomentCandidatesRequest;

  try {
    const data = await api.getGameMomentCandidates(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GameMemoryCandidateSet**](GameMemoryCandidateSet.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGameWishCandidates

> GameWishCandidateSet getGameWishCandidates(spaceId)

Get Game Wish Candidates

Return Premium-authorized OPEN shared Wishes for #864.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGameWishCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGameWishCandidatesRequest;

  try {
    const data = await api.getGameWishCandidates(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GameWishCandidateSet**](GameWishCandidateSet.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

