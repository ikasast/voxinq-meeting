package io.github.ikasast.voxinq

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QuickWidgetTest {
    @Test
    fun eachButtonOpensItsOwnPage() {
        assertEquals("/quick-record", QuickWidget.pathFor(MainActivity.ACTION_QUICK_RECORD))
        assertEquals("/new", QuickWidget.pathFor(MainActivity.ACTION_NEW_MEETING))
    }

    @Test
    fun anythingElseIsNotTheWidgets() {
        assertNull(QuickWidget.pathFor(MainActivity.ACTION_OPEN_MEETING))
        assertNull(QuickWidget.pathFor(null))
        assertNull(QuickWidget.pathFor("io.github.ikasast.voxinq.SOMETHING_ELSE"))
    }
}
