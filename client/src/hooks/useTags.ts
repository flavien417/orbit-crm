/**
 * useTags — fetches and mutates the persistent custom tag lists from the server.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TagsResponse {
  connectionTags: string[];
  industryTags: string[];
}

export function useTags() {
  const { data, isLoading } = useQuery<TagsResponse>({
    queryKey: ["/api/tags"],
  });

  const mutation = useMutation({
    mutationFn: (next: TagsResponse) => apiRequest("PUT", "/api/tags", next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tags"] }),
  });

  const connectionTags = data?.connectionTags ?? [];
  const industryTags = data?.industryTags ?? [];

  function addConnectionTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || connectionTags.includes(trimmed)) return;
    mutation.mutate({ connectionTags: [...connectionTags, trimmed], industryTags });
  }

  function removeConnectionTag(tag: string) {
    mutation.mutate({ connectionTags: connectionTags.filter((t) => t !== tag), industryTags });
  }

  function addIndustryTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || industryTags.includes(trimmed)) return;
    mutation.mutate({ connectionTags, industryTags: [...industryTags, trimmed] });
  }

  function removeIndustryTag(tag: string) {
    mutation.mutate({ connectionTags, industryTags: industryTags.filter((t) => t !== tag) });
  }

  return {
    connectionTags,
    industryTags,
    isLoading,
    addConnectionTag,
    removeConnectionTag,
    addIndustryTag,
    removeIndustryTag,
  };
}
