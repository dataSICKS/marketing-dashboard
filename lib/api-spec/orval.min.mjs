export default {
  "api-client-react": {
    input: { target: "/home/runner/workspace/lib/api-spec/openapi.yaml" },
    output: {
      target: "/home/runner/workspace/lib/api-client-react/src/generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: "/home/runner/workspace/lib/api-client-react/src/custom-fetch.ts",
          name: "customFetch",
        },
      },
    },
  },
};
