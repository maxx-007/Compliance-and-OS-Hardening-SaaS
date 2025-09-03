import ast, operator as op

OPERATORS = {
    ast.Eq: op.eq,
    ast.NotEq: op.ne,
    ast.Lt: op.lt,
    ast.LtE: op.le,
    ast.Gt: op.gt,
    ast.GtE: op.ge,
    ast.And: lambda a, b: a and b,
    ast.Or: lambda a, b: a or b,
}

def eval_expr(expr, context):
    node = ast.parse(expr, mode='eval')
    return _eval(node.body, context)

def _eval(node, context):
    if isinstance(node, ast.BoolOp):
        left = _eval(node.values[0], context)
        for val in node.values[1:]:
            right = _eval(val, context)
            op_func = OPERATORS[type(node.op)]
            left = op_func(left, right)
        return left
    elif isinstance(node, ast.Compare):
        left = _eval(node.left, context)
        for op_node, comparator in zip(node.ops, node.comparators):
            right = _eval(comparator, context)
            op_func = OPERATORS[type(op_node)]
            if not op_func(left, right):
                return False
            left = right
        return True
    elif isinstance(node, ast.Name):
        return context.get(node.id, None)
    elif isinstance(node, ast.Constant):
        return node.value
    else:
        raise TypeError('Unsupported expression')
