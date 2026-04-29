export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [2, 'always', 200],
    'scope-enum': [
      2,
      'always',
      [
        // core
        'app',
        // infra
        'ci',
        'deps',
        'docs'
      ]
    ]
  }
}
