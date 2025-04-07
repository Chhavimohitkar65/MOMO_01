export const TestTemplates = {
  jest: `
import { functionName } from '../path/to/source';

describe('functionName', () => {
  beforeEach(() => {
    // Setup code
  });

  afterEach(() => {
    // Cleanup code
  });

  test('should handle normal case', () => {
    // Test implementation
  });

  test('should handle edge cases', () => {
    // Test implementation
  });

  test('should handle errors', () => {
    // Test implementation
  });
});
`,

  mocha: `
const { expect } = require('chai');
const { functionName } = require('../path/to/source');

describe('functionName', () => {
  beforeEach(() => {
    // Setup code
  });

  afterEach(() => {
    // Cleanup code
  });

  it('should handle normal case', () => {
    // Test implementation
  });

  it('should handle edge cases', () => {
    // Test implementation
  });

  it('should handle errors', () => {
    // Test implementation
  });
});
`,

  pytest: `
import pytest
from path.to.source import function_name

def setup_function():
    # Setup code
    pass

def teardown_function():
    # Cleanup code
    pass

def test_normal_case():
    # Test implementation
    pass

def test_edge_cases():
    # Test implementation
    pass

def test_errors():
    # Test implementation
    pass
`,

  junit: `
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.*;

class TestClassName {
    @BeforeEach
    void setUp() {
        // Setup code
    }

    @AfterEach
    void tearDown() {
        // Cleanup code
    }

    @Test
    void testNormalCase() {
        // Test implementation
    }

    @Test
    void testEdgeCases() {
        // Test implementation
    }

    @Test
    void testErrors() {
        // Test implementation
    }
}
`
}; 